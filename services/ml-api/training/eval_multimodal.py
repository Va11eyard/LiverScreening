#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
from sklearn.metrics import (
    balanced_accuracy_score,
    f1_score,
    roc_auc_score,
)
from torch.utils.data import DataLoader

ROOT = Path(__file__).resolve().parent
import sys

sys.path.insert(0, str(ROOT))

from dataset import LiverUSDataset, val_transform
from model import build_model

CLINICAL_FEATURES = ["age", "bmi", "alt", "ast", "glucose", "ldl", "hdl", "triglycerides", "waist_cm"]
VISION_WEIGHT = 0.30
CLINICAL_WEIGHT = 0.70
METRICS_DIR = ROOT.parent / "docs" / "metrics"


def _vision_probs(model, loader, device) -> np.ndarray:
    model.eval()
    probs = []
    with torch.no_grad():
        for images, _ in loader:
            images = images.to(device)
            logits = model(images)
            batch = torch.softmax(logits, dim=1)[:, 1].cpu().numpy()
            probs.extend(batch.tolist())
    return np.array(probs, dtype=np.float32)


def _clinical_probs(df: pd.DataFrame, bundle: dict | None) -> np.ndarray:
    if bundle is None:
        return np.zeros(len(df), dtype=np.float32)
    model = bundle["model"]
    features = bundle["features"]
    rows = []
    for col in features:
        rows.append(df[col] if col in df.columns else pd.Series([np.nan] * len(df)))
    X = pd.concat(rows, axis=1)
    mask = X.notna().all(axis=1).values
    out = np.zeros(len(df), dtype=np.float32)
    if mask.any():
        out[mask] = model.predict_proba(X[mask])[:, 1]
    return out


def _metrics(y_true: np.ndarray, y_prob: np.ndarray, label: str) -> dict:
    y_pred = (y_prob >= 0.5).astype(int)
    result = {
        "mode": label,
        "n": int(len(y_true)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "weighted_f1": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
    }
    if len(np.unique(y_true)) > 1:
        result["auc"] = float(roc_auc_score(y_true, y_prob))
    else:
        result["auc"] = None
    return result


def evaluate(test_csv: Path, ckpt: Path, clinical_path: Path) -> dict:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    df = pd.read_csv(test_csv)
    y_true = df["class_id"].astype(int).values

    ds = LiverUSDataset(test_csv, transform=val_transform)
    loader = DataLoader(ds, batch_size=16, shuffle=False)
    model = build_model(num_classes=2, pretrained=False)
    state = torch.load(ckpt, map_location=device, weights_only=False)
    model.load_state_dict(state["model_state"])
    model.to(device)

    vision_prob = _vision_probs(model, loader, device)
    clinical_bundle = joblib.load(clinical_path) if clinical_path.exists() else None
    clinical_prob = _clinical_probs(df, clinical_bundle)
    fusion_prob = CLINICAL_WEIGHT * clinical_prob + VISION_WEIGHT * vision_prob
    fusion_prob = np.clip(fusion_prob, 0.0, 1.0)

    report = {
        "overall": [
            _metrics(y_true, vision_prob, "image_only"),
            _metrics(y_true, clinical_prob, "clinical_only"),
            _metrics(y_true, fusion_prob, "fusion_0.7_0.3"),
        ],
        "by_source": {},
    }

    for source in sorted(df["source"].unique()):
        mask = (df["source"] == source).values
        if mask.sum() == 0:
            continue
        report["by_source"][source] = [
            _metrics(y_true[mask], vision_prob[mask], "image_only"),
            _metrics(y_true[mask], clinical_prob[mask], "clinical_only"),
            _metrics(y_true[mask], fusion_prob[mask], "fusion_0.7_0.3"),
        ]

    zenodo_mask = (df["source"] == "zenodo").values
    if zenodo_mask.any():
        report["zenodo_image_only"] = _metrics(y_true[zenodo_mask], vision_prob[zenodo_mask], "image_only")

    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", default=str(ROOT.parent / "data/processed/metadata_test.csv"))
    parser.add_argument("--ckpt", default=str(ROOT.parent / "models/liver_efficientnet_b3_best.pth"))
    parser.add_argument("--clinical", default=str(ROOT.parent / "models/clinical_baseline.joblib"))
    args = parser.parse_args()

    ckpt = Path(args.ckpt)
    if not ckpt.exists():
        raise SystemExit(f"Missing checkpoint: {ckpt}")

    report = evaluate(Path(args.test), ckpt, Path(args.clinical))
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    json_path = METRICS_DIR / "multimodal_eval.json"
    txt_path = METRICS_DIR / "eval_report.txt"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    lines = ["Multimodal evaluation (test split)", "=" * 40]
    for row in report["overall"]:
        auc = row.get("auc")
        auc_s = f"{auc:.4f}" if auc is not None else "n/a"
        lines.append(
            f"{row['mode']}: n={row['n']} bal_acc={row['balanced_accuracy']:.4f} "
            f"f1={row['weighted_f1']:.4f} auc={auc_s}"
        )
    for source, rows in report.get("by_source", {}).items():
        lines.append(f"\nSource: {source}")
        for row in rows:
            auc = row.get("auc")
            auc_s = f"{auc:.4f}" if auc is not None else "n/a"
            lines.append(
                f"  {row['mode']}: bal_acc={row['balanced_accuracy']:.4f} auc={auc_s}"
            )
    body = "\n".join(lines)
    txt_path.write_text(body, encoding="utf-8")
    print(body)
    print(f"Wrote {json_path}")


if __name__ == "__main__":
    main()
