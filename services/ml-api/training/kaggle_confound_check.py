#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pandas as pd
from PIL import Image
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

from kaggle_fibrosis_dataset import (
    PROCESSED_DIR,
    build_hash_group_splits,
    collect_kaggle_rows,
    file_md5,
    find_kaggle_root,
    load_us_normalized_array,
)

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_KAGGLE_ROOT = ROOT / "data/raw/kaggle_fibrosis"
OUT = PROCESSED_DIR / "kaggle_leakage_audit" / "confound_unique_report.json"


def metadata_rows(kaggle_root: Path) -> pd.DataFrame:
    df = collect_kaggle_rows(kaggle_root)
    rows = []
    for _, row in df.iterrows():
        p = Path(row["file_path"])
        with Image.open(p) as img:
            w, h = img.size
            fmt = img.format
        rows.append(
            {
                "file_path": row["file_path"],
                "md5": file_md5(p),
                "class_id": int(row["class_id"]),
                "fibrosis_stage": row["fibrosis_stage"],
                "width": w,
                "height": h,
                "format": fmt,
                "suffix": p.suffix.lower(),
            }
        )
    return pd.DataFrame(rows)


def signature_frame(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["sig"] = out.apply(lambda r: f"{r['width']}x{r['height']}_{r['format']}", axis=1)
    return out


def confound_stats(df: pd.DataFrame, label: str) -> dict:
    uniq = df.drop_duplicates("md5")
    uniq = signature_frame(uniq)
    ct = pd.crosstab(uniq["sig"], uniq["class_id"])
    purity = ct.apply(lambda row: row.max() / row.sum(), axis=1)
    mixed = ct[ct.min(axis=1) > 0]

    rules = {}
    for name, mask in [
        ("rule_640x480_jpeg", (uniq.width == 640) & (uniq.height == 480) & (uniq.format == "JPEG")),
        ("rule_png", uniq.format == "PNG"),
        ("rule_449x464", (uniq.width == 449) & (uniq.height == 464)),
    ]:
        sub = uniq[mask]
        if len(sub) == 0:
            rules[name] = {"n": 0}
        else:
            pred = 0 if name == "rule_640x480_jpeg" else 1
            rules[name] = {
                "n": int(len(sub)),
                "class0_pct": float((sub.class_id == 0).mean()),
                "class1_pct": float((sub.class_id == 1).mean()),
                "predicts_class": pred,
            }

    majority_pred = uniq["sig"].map(ct.idxmax(axis=1))
    acc = accuracy_score(uniq["class_id"], majority_pred)

    return {
        "label": label,
        "total_files": int(len(df)),
        "unique_md5": int(uniq.md5.nunique()),
        "unique_f0": int((uniq.class_id == 0).sum()),
        "unique_f1_4": int((uniq.class_id == 1).sum()),
        "signatures": int(len(ct)),
        "pure_class_signatures": int((purity == 1.0).sum()),
        "mixed_signatures": int(len(mixed)),
        "mixed_signature_examples": mixed.head(10).to_dict(),
        "majority_signature_classifier_acc": float(acc),
        "rule_stats": rules,
        "top_f0_signatures": uniq[uniq.class_id == 0].sig.value_counts().head(5).to_dict(),
        "top_f1_4_signatures": uniq[uniq.class_id == 1].sig.value_counts().head(5).to_dict(),
    }


def post_normalize_confound_sample(df: pd.DataFrame, sample_n: int = 200) -> dict:
    uniq = df.drop_duplicates("md5").sample(n=min(sample_n, len(df.drop_duplicates("md5"))), random_state=42)
    native_sigs = set()
    norm_sizes = set()
    for _, row in uniq.iterrows():
        with Image.open(row["file_path"]) as img:
            native_sigs.add(f"{img.size[0]}x{img.size[1]}_{img.format}")
        arr = load_us_normalized_array(row["file_path"])
        norm_sizes.add(f"{arr.shape[1]}x{arr.shape[0]}")
    return {
        "sample_n": int(len(uniq)),
        "native_signature_kinds": len(native_sigs),
        "normalized_spatial_shapes": sorted(norm_sizes),
        "all_normalized_same_shape": len(norm_sizes) == 1,
    }


def main() -> None:
    kaggle_root = DEFAULT_KAGGLE_ROOT
    full_meta = metadata_rows(kaggle_root)
    full_stats = confound_stats(full_meta, "full_dataset_all_files")
    unique_only = full_meta.drop_duplicates("md5")
    unique_stats = confound_stats(unique_only, "unique_md5_deduped")

    train_df, val_df = build_hash_group_splits(kaggle_root, val_size=0.1, seed=42, dedupe_to_one_path=True)
    split_meta = metadata_rows(kaggle_root)
    split_meta = split_meta[split_meta["file_path"].isin(set(train_df["file_path"]) | set(val_df["file_path"]))]
    split_stats = confound_stats(split_meta, "hash_group_split_deduped")

    overlap = len(set(train_df["md5"]) & set(val_df["md5"]))
    norm_probe = post_normalize_confound_sample(full_meta)

    report = {
        "full_dataset": full_stats,
        "unique_md5_only": unique_stats,
        "hash_group_split_deduped": split_stats,
        "hash_split_md5_overlap": overlap,
        "normalize_pipeline_probe": norm_probe,
        "verdict": {
            "confound_persists_on_unique": unique_stats["majority_signature_classifier_acc"] > 0.85,
            "mixed_signature_subset_exists": unique_stats["mixed_signatures"] > 0,
            "recommendation": (
                "apply_normalize_transform_and_retrain"
                if unique_stats["majority_signature_classifier_acc"] > 0.85
                else "hash_split_may_be_enough"
            ),
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
