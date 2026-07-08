#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader

from kaggle_fibrosis_dataset import (
    KaggleFibrosisDataset,
    PROCESSED_DIR,
    build_hash_group_splits,
    file_md5,
    get_kaggle_val_transform,
    load_us_normalized_array,
)
from model import build_model

ROOT = Path(__file__).resolve().parent.parent
VAL_CSV = PROCESSED_DIR / "kaggle_metadata_val.csv"
TRAIN_CSV = PROCESSED_DIR / "kaggle_metadata_train.csv"
CKPT_V2 = ROOT / "checkpoints/kaggle_pretrain_best_v2.pt"
OUT = PROCESSED_DIR / "kaggle_leakage_audit" / "shortcut_probe_v2.json"


def native_signature(path: str) -> str:
    with Image.open(path) as img:
        return f"{img.size[0]}x{img.size[1]}_{img.format}"


def probe_native_signature_classifier(df: pd.DataFrame) -> dict:
    df = df.copy()
    df["sig"] = df["file_path"].map(native_signature)
    ct = pd.crosstab(df["sig"], df["class_id"])
    pred_map = ct.idxmax(axis=1)
    pred = df["sig"].map(pred_map)
    return {
        "accuracy": float(accuracy_score(df["class_id"], pred)),
        "signatures": ct.to_dict(),
    }


def probe_normalized_pixel_baseline(train_df: pd.DataFrame, val_df: pd.DataFrame, sample_n: int = 400) -> dict:
    train = train_df.sample(n=min(sample_n, len(train_df)), random_state=42)
    val = val_df
    X_train, y_train = [], []
    for _, row in train.iterrows():
        arr = load_us_normalized_array(row["file_path"]).astype(np.float32) / 255.0
        X_train.append(arr.mean(axis=(0, 1)))
        y_train.append(int(row["class_id"]))
    X_val, y_val = [], []
    for _, row in val.iterrows():
        arr = load_us_normalized_array(row["file_path"]).astype(np.float32) / 255.0
        X_val.append(arr.mean(axis=(0, 1)))
        y_val.append(int(row["class_id"]))
    clf = LogisticRegression(max_iter=1000)
    clf.fit(np.array(X_train), np.array(y_train))
    probs = clf.predict_proba(np.array(X_val))[:, 1]
    preds = (probs >= 0.5).astype(int)
    return {
        "mean_rgb_logreg_val_auc": float(roc_auc_score(y_val, probs)),
        "mean_rgb_logreg_val_acc": float(accuracy_score(y_val, preds)),
    }


def probe_downsampled_cnn_val() -> dict:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    val_ds = KaggleFibrosisDataset(VAL_CSV, transform=get_kaggle_val_transform())
    loader = DataLoader(val_ds, batch_size=32, shuffle=False)
    model = build_model(num_classes=2, pretrained=False).to(device)
    ckpt = torch.load(CKPT_V2, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    labels, probs, preds = [], [], []
    with torch.no_grad():
        for images, y in loader:
            images = images.to(device)
            logits = model(images)
            p = torch.softmax(logits, dim=1)[:, 1].cpu().numpy()
            pred = logits.argmax(dim=1).cpu().numpy()
            probs.extend(p.tolist())
            preds.extend(pred.tolist())
            labels.extend(y.numpy().tolist())
    cm = {
        "tn_fp_fn_tp": [
            sum(1 for y, p in zip(labels, preds) if y == 0 and p == 0),
            sum(1 for y, p in zip(labels, preds) if y == 0 and p == 1),
            sum(1 for y, p in zip(labels, preds) if y == 1 and p == 0),
            sum(1 for y, p in zip(labels, preds) if y == 1 and p == 1),
        ]
    }
    return {
        "val_auc": float(roc_auc_score(labels, probs)),
        "val_acc": float(accuracy_score(labels, preds)),
        "confusion": cm,
        "misclassified": int(sum(y != p for y, p in zip(labels, preds))),
    }


def probe_mixed_jpeg_subset(kaggle_root: Path) -> dict:
    train_df, val_df = build_hash_group_splits(kaggle_root, dedupe_to_one_path=True)
    train_df["sig"] = train_df["file_path"].map(native_signature)
    val_df["sig"] = val_df["file_path"].map(native_signature)
    mixed_sig = "640x480_JPEG"
    train_m = train_df[train_df["sig"] == mixed_sig]
    val_m = val_df[val_df["sig"] == mixed_sig]
    if len(val_m) < 10 or train_m["class_id"].nunique() < 2:
        return {"skipped": True, "reason": "mixed subset too small in split"}
    probe = probe_normalized_pixel_baseline(train_m, val_m, sample_n=len(train_m))
    native = probe_native_signature_classifier(pd.concat([train_m, val_m]))
    return {
        "train_n": int(len(train_m)),
        "val_n": int(len(val_m)),
        "native_signature_acc_on_subset": native["accuracy"],
        **probe,
    }


def main() -> None:
    train_df = pd.read_csv(TRAIN_CSV)
    val_df = pd.read_csv(VAL_CSV)
    full = pd.concat([train_df, val_df], ignore_index=True)

    report = {
        "cnn_v2_checkpoint": probe_downsampled_cnn_val(),
        "native_signature_on_split": probe_native_signature_classifier(full),
        "native_signature_val_only": probe_native_signature_classifier(val_df),
        "normalized_mean_rgb_logreg": probe_normalized_pixel_baseline(train_df, val_df),
        "mixed_640x480_jpeg_subset": probe_mixed_jpeg_subset(ROOT / "data/raw/kaggle_fibrosis"),
        "val_signature_counts": val_df.assign(sig=val_df["file_path"].map(native_signature))["sig"].value_counts().to_dict(),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
