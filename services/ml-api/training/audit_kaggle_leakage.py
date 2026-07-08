#!/usr/bin/env python3
from __future__ import annotations

import json
import random
from collections import defaultdict
from pathlib import Path

import imagehash
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from PIL import Image
from PIL.ExifTags import TAGS
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader

from kaggle_fibrosis_dataset import (
    KaggleFibrosisDataset,
    get_kaggle_val_transform,
    load_us_rgb_array,
)
from model import build_model

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data/processed"
TRAIN_CSV = PROCESSED / "kaggle_metadata_train.csv"
VAL_CSV = PROCESSED / "kaggle_metadata_val.csv"
CKPT = ROOT / "checkpoints/kaggle_pretrain_best.pt"
OUT_DIR = PROCESSED / "kaggle_leakage_audit"
PHASH_THRESHOLD = 5


def phash_hex(path: str) -> str:
    with Image.open(path) as img:
        return str(imagehash.phash(img.convert("RGB")))


def hamming(a: str, b: str) -> int:
    return imagehash.hex_to_hash(a) - imagehash.hex_to_hash(b)


def check_path_duplicates(train_df: pd.DataFrame, val_df: pd.DataFrame) -> dict:
    train_paths = set(train_df["file_path"])
    val_paths = set(val_df["file_path"])
    train_names = train_df.assign(basename=train_df["file_path"].map(lambda p: Path(p).name))
    val_names = val_df.assign(basename=val_df["file_path"].map(lambda p: Path(p).name))
    shared_basenames = set(train_names["basename"]) & set(val_names["basename"])
    pairs = []
    for name in sorted(shared_basenames):
        t_rows = train_names[train_names["basename"] == name]
        v_rows = val_names[val_names["basename"] == name]
        for _, tr in t_rows.iterrows():
            for _, vr in v_rows.iterrows():
                pairs.append(
                    {
                        "basename": name,
                        "train_path": tr["file_path"],
                        "val_path": vr["file_path"],
                        "same_path": tr["file_path"] == vr["file_path"],
                    }
                )
    return {
        "path_overlap": len(train_paths & val_paths),
        "basename_overlap": len(shared_basenames),
        "basename_pairs": pairs,
    }


def check_phash_duplicates(train_df: pd.DataFrame, val_df: pd.DataFrame) -> dict:
    print("Computing phash for train...")
    train_hashes = []
    for i, row in train_df.iterrows():
        if i % 500 == 0:
            print(f"  train {i}/{len(train_df)}")
        try:
            h = phash_hex(row["file_path"])
            train_hashes.append((row["file_path"], int(row["class_id"]), row["fibrosis_stage"], h))
        except Exception as exc:
            train_hashes.append((row["file_path"], int(row["class_id"]), row["fibrosis_stage"], f"ERR:{exc}"))

    print("Computing phash for val...")
    val_hashes = []
    for i, row in val_df.iterrows():
        if i % 100 == 0:
            print(f"  val {i}/{len(val_df)}")
        try:
            h = phash_hex(row["file_path"])
            val_hashes.append((row["file_path"], int(row["class_id"]), row["fibrosis_stage"], h))
        except Exception as exc:
            val_hashes.append((row["file_path"], int(row["class_id"]), row["fibrosis_stage"], f"ERR:{exc}"))

    exact_cross = []
    near_cross = []
    train_exact_dupes = defaultdict(list)
    val_exact_dupes = defaultdict(list)

    for tp, tc, ts, th in train_hashes:
        if th.startswith("ERR"):
            continue
        train_exact_dupes[th].append((tp, tc, ts))
    for vp, vc, vs, vh in val_hashes:
        if vh.startswith("ERR"):
            continue
        val_exact_dupes[vh].append((vp, vc, vs))

    train_internal_dupes = {h: items for h, items in train_exact_dupes.items() if len(items) > 1}
    val_internal_dupes = {h: items for h, items in val_exact_dupes.items() if len(items) > 1}

    val_hash_list = [(vp, vc, vs, vh) for vp, vc, vs, vh in val_hashes if not vh.startswith("ERR")]
    train_hash_list = [(tp, tc, ts, th) for tp, tc, ts, th in train_hashes if not th.startswith("ERR")]

    for vp, vc, vs, vh in val_hash_list:
        for tp, tc, ts, th in train_hash_list:
            if vh == th:
                exact_cross.append(
                    {
                        "hamming": 0,
                        "train_path": tp,
                        "val_path": vp,
                        "train_class": tc,
                        "val_class": vc,
                        "train_stage": ts,
                        "val_stage": vs,
                        "cross_label": tc != vc,
                    }
                )
            else:
                d = hamming(vh, th)
                if d <= PHASH_THRESHOLD:
                    near_cross.append(
                        {
                            "hamming": int(d),
                            "train_path": tp,
                            "val_path": vp,
                            "train_class": tc,
                            "val_class": vc,
                            "train_stage": ts,
                            "val_stage": vs,
                            "cross_label": tc != vc,
                        }
                    )

    near_cross = sorted(near_cross, key=lambda x: x["hamming"])
    return {
        "phash_threshold": PHASH_THRESHOLD,
        "exact_cross_split": exact_cross,
        "near_cross_split_count": len(near_cross),
        "near_cross_split_sample": near_cross[:30],
        "train_internal_exact_hash_groups": len(train_internal_dupes),
        "train_internal_exact_dup_images": sum(len(v) for v in train_internal_dupes.values()),
        "val_internal_exact_hash_groups": len(val_internal_dupes),
        "val_internal_exact_dup_images": sum(len(v) for v in val_internal_dupes.values()),
        "train_internal_sample": [
            {"hash": h, "count": len(items), "paths": [p for p, _, _ in items[:5]]}
            for h, items in list(train_internal_dupes.items())[:10]
        ],
    }


def extract_exif_summary(path: str) -> dict:
    out: dict = {}
    try:
        with Image.open(path) as img:
            exif = img.getexif()
            if exif:
                for tag_id, value in exif.items():
                    tag = TAGS.get(tag_id, tag_id)
                    if isinstance(value, (bytes, bytearray)):
                        value = value[:64]
                    out[str(tag)] = value
    except Exception:
        pass
    return out


def file_metadata_row(path: str, class_id: int, stage: str) -> dict:
    p = Path(path)
    with Image.open(path) as img:
        w, h = img.size
        mode = img.mode
        fmt = img.format
    stat = p.stat()
    exif = extract_exif_summary(path)
    return {
        "file_path": path,
        "class_id": class_id,
        "fibrosis_stage": stage,
        "basename": p.name,
        "suffix": p.suffix.lower(),
        "size_bytes": stat.st_size,
        "width": w,
        "height": h,
        "aspect_ratio": round(w / h, 4) if h else None,
        "mode": mode,
        "format": fmt,
        "has_exif": bool(exif),
        "exif_keys": ",".join(sorted(exif.keys())) if exif else "",
    }


def metadata_by_class(df: pd.DataFrame, sample_n: int | None = None) -> pd.DataFrame:
    rows = []
    subset = df if sample_n is None else df.sample(n=min(sample_n, len(df)), random_state=42)
    for i, row in subset.iterrows():
        if len(rows) % 500 == 0 and len(rows) > 0:
            print(f"  metadata {len(rows)}/{len(subset)}")
        rows.append(file_metadata_row(row["file_path"], int(row["class_id"]), row["fibrosis_stage"]))
    return pd.DataFrame(rows)


def summarize_metadata(meta: pd.DataFrame) -> dict:
    summary = {}
    for label, name in [(0, "F0_binary"), (1, "F1-F4_binary")]:
        sub = meta[meta["class_id"] == label]
        summary[name] = {
            "n": len(sub),
            "size_bytes_mean": float(sub["size_bytes"].mean()),
            "size_bytes_std": float(sub["size_bytes"].std()),
            "width_mean": float(sub["width"].mean()),
            "height_mean": float(sub["height"].mean()),
            "aspect_ratio_mean": float(sub["aspect_ratio"].mean()),
            "suffix_counts": sub["suffix"].value_counts().to_dict(),
            "format_counts": sub["format"].value_counts().to_dict(),
            "has_exif_pct": float(sub["has_exif"].mean() * 100),
        }
    for stage in sorted(meta["fibrosis_stage"].unique()):
        sub = meta[meta["fibrosis_stage"] == stage]
        summary[f"stage_{stage}"] = {
            "n": len(sub),
            "size_bytes_mean": float(sub["size_bytes"].mean()),
            "width_mean": float(sub["width"].mean()),
            "height_mean": float(sub["height"].mean()),
            "aspect_ratio_mean": float(sub["aspect_ratio"].mean()),
            "suffix_counts": sub["suffix"].value_counts().to_dict(),
        }
    return summary


def confusion_on_val() -> dict:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    val_ds = KaggleFibrosisDataset(VAL_CSV, transform=get_kaggle_val_transform())
    loader = DataLoader(val_ds, batch_size=32, shuffle=False, num_workers=0)

    model = build_model(num_classes=2, pretrained=False).to(device)
    ckpt = torch.load(CKPT, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    all_labels: list[int] = []
    all_preds: list[int] = []
    all_probs: list[float] = []
    all_paths: list[str] = []

    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            logits = model(images)
            probs = torch.softmax(logits, dim=1)[:, 1].cpu().numpy()
            preds = logits.argmax(dim=1).cpu().numpy()
            all_probs.extend(probs.tolist())
            all_preds.extend(preds.tolist())
            all_labels.extend(labels.numpy().tolist())

    for i in range(len(val_ds)):
        all_paths.append(val_ds.df.iloc[i]["file_path"])

    cm = confusion_matrix(all_labels, all_preds, labels=[0, 1])
    report = classification_report(all_labels, all_preds, target_names=["F0", "F1-F4"], output_dict=True)

    misclassified = []
    for i, (y, p, prob) in enumerate(zip(all_labels, all_preds, all_probs)):
        if y != p:
            row = val_ds.df.iloc[i]
            misclassified.append(
                {
                    "path": all_paths[i],
                    "true": int(y),
                    "pred": int(p),
                    "prob_pos": float(prob),
                    "stage": row["fibrosis_stage"],
                }
            )

    rng = random.Random(42)
    samples = {"F0": [], "F1-F4": []}
    for cls_id, key in [(0, "F0"), (1, "F1-F4")]:
        idxs = [i for i, y in enumerate(all_labels) if y == cls_id]
        pick = rng.sample(idxs, min(10, len(idxs)))
        for i in pick:
            row = val_ds.df.iloc[i]
            samples[key].append(
                {
                    "path": all_paths[i],
                    "true_class": int(all_labels[i]),
                    "pred_class": int(all_preds[i]),
                    "prob_pos": float(all_probs[i]),
                    "fibrosis_stage": row["fibrosis_stage"],
                    "basename": Path(all_paths[i]).name,
                    "correct": all_labels[i] == all_preds[i],
                }
            )

    return {
        "confusion_matrix": cm.tolist(),
        "classification_report": report,
        "misclassified_count": len(misclassified),
        "misclassified": misclassified[:20],
        "val_samples_per_class": samples,
        "all_correct": len(misclassified) == 0,
    }


def audit_split_code() -> dict:
    return {
        "split_timing": "train_test_split runs on raw file paths BEFORE any transforms",
        "normalization": "ImageNet mean/std applied per-batch in Dataset transform AFTER split (fixed constants, not fit on data)",
        "global_stats_leakage": False,
        "patient_level_split": False,
        "note": "Split is image-level stratified random 90/10, NOT grouped by patient or source scan",
        "write_split_csvs_calls_build_twice": True,
        "write_split_csvs_issue": "main() calls build_kaggle_splits then write_split_csvs which calls build_kaggle_splits again — same seed so identical, but redundant",
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    train_df = pd.read_csv(TRAIN_CSV)
    val_df = pd.read_csv(VAL_CSV)

    print("=== 1. Path / basename duplicates ===")
    path_dupes = check_path_duplicates(train_df, val_df)
    print(json.dumps(path_dupes, indent=2, ensure_ascii=False))

    print("\n=== 2. Perceptual hash (phash) cross-split ===")
    phash_report = check_phash_duplicates(train_df, val_df)
    print(
        f"exact_cross={len(phash_report['exact_cross_split'])} "
        f"near_cross(<={PHASH_THRESHOLD})={phash_report['near_cross_split_count']}"
    )
    print(f"train internal exact dup groups: {phash_report['train_internal_exact_hash_groups']}")
    print(f"val internal exact dup groups: {phash_report['val_internal_exact_hash_groups']}")

    print("\n=== 3. File metadata by class (full dataset) ===")
    meta = metadata_by_class(pd.concat([train_df, val_df], ignore_index=True))
    meta_summary = summarize_metadata(meta)
    print(json.dumps(meta_summary, indent=2))
    meta.to_csv(OUT_DIR / "kaggle_file_metadata.csv", index=False)

    print("\n=== 4. Confusion matrix on val (trained checkpoint) ===")
    cm_report = confusion_on_val()
    print("CM [[TN, FP], [FN, TP]]:", cm_report["confusion_matrix"])
    print("misclassified:", cm_report["misclassified_count"])
    print(json.dumps(cm_report["classification_report"], indent=2))

    print("\n=== 5. Split code audit ===")
    split_audit = audit_split_code()
    print(json.dumps(split_audit, indent=2))

    full_report = {
        "path_duplicates": path_dupes,
        "phash": phash_report,
        "metadata_summary": meta_summary,
        "confusion_matrix": cm_report,
        "split_code_audit": split_audit,
    }
    out_json = OUT_DIR / "kaggle_leakage_report.json"
    with out_json.open("w", encoding="utf-8") as f:
        json.dump(full_report, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {out_json}")


if __name__ == "__main__":
    main()
