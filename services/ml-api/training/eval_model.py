#!/usr/bin/env python3

from __future__ import annotations

from pathlib import Path

import pandas as pd
import torch
from sklearn.metrics import balanced_accuracy_score, classification_report, f1_score
from torch.utils.data import DataLoader

ROOT = Path(__file__).resolve().parent
import sys

sys.path.insert(0, str(ROOT))

from dataset import LiverUSDataset, val_transform
from model import build_model

METRICS_DIR = ROOT.parent / "docs" / "metrics"
CKPT = ROOT.parent / "models" / "liver_efficientnet_b3_best.pth"
TEST_CSV = ROOT.parent / "data" / "processed" / "metadata_test.csv"


def main() -> None:
    if not CKPT.exists():
        print("No checkpoint:", CKPT)
        return
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(CKPT, map_location=device, weights_only=False)
    num_classes = int(ckpt.get("config", {}).get("num_classes", 2))
    model = build_model(num_classes=num_classes, pretrained=False)
    model.load_state_dict(ckpt["model_state"])
    model.to(device).eval()

    ds = LiverUSDataset(TEST_CSV, transform=val_transform)
    loader = DataLoader(ds, batch_size=16, shuffle=False)
    preds, labels = [], []
    with torch.no_grad():
        for images, y in loader:
            images = images.to(device)
            out = model(images).argmax(dim=1).cpu().tolist()
            preds.extend(out)
            labels.extend(y.tolist())

    acc = balanced_accuracy_score(labels, preds)
    f1 = f1_score(labels, preds, average="weighted", zero_division=0)
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    report = classification_report(labels, preds, zero_division=0)
    out_path = METRICS_DIR / "eval_report.txt"
    body = f"checkpoint: {CKPT}\nbalanced_accuracy: {acc:.4f}\nweighted_f1: {f1:.4f}\n\n{report}"
    out_path.write_text(body, encoding="utf-8")
    print(body)
    print("Wrote", out_path)


if __name__ == "__main__":
    main()
