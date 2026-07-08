#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import timm
import torch
from torch.utils.data import DataLoader

from patient_split import stratified_patient_split
from train import LiverUSCsvDataset, build_eval_transform, evaluate_tta, format_auc, set_seed
from train_candidate import LABEL_SCHEMES, compute_val_auc, log_experiment, remap_labels, save_candidate_metadata

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TRAINING_ROOT = Path(__file__).resolve().parent
ML_API_ROOT = TRAINING_ROOT.parent

@torch.no_grad()
def ensemble_eval(
    checkpoints: list[Path],
    test_ds: LiverUSCsvDataset,
    device: torch.device,
    input_size: int,
    tta_rounds: int,
) -> tuple[np.ndarray, np.ndarray]:
    models: list[torch.nn.Module] = []
    scheme = None
    model_name = None
    for path in checkpoints:
        ckpt = torch.load(path, map_location=device, weights_only=False)
        scheme = ckpt.get("label_scheme", scheme)
        model_name = ckpt.get("model_name", model_name)
        num_classes = int(ckpt.get("num_classes", 2))
        model = timm.create_model(str(model_name), pretrained=False, num_classes=num_classes, in_chans=3)
        model.load_state_dict(ckpt["model_state"])
        model.to(device).eval()
        models.append(model)

    use_amp = device.type == "cuda"
    all_labels: list[int] = []
    prob_sums: list[np.ndarray] = []

    for idx in range(len(test_ds)):
        row_probs: list[np.ndarray] = []
        for _ in range(tta_rounds):
            tensor, label = test_ds[idx]
            tensor = tensor.unsqueeze(0).to(device)
            round_probs = []
            for model in models:
                with torch.cuda.amp.autocast(enabled=use_amp):
                    logits = model(tensor)
                round_probs.append(torch.softmax(logits, dim=1).cpu().numpy()[0])
            row_probs.append(np.mean(round_probs, axis=0))
        prob_sums.append(np.mean(row_probs, axis=0))
        all_labels.append(int(label.item() if hasattr(label, "item") else label))

    return np.asarray(all_labels, dtype=np.int64), np.stack(prob_sums, axis=0)

def main() -> None:
    parser = argparse.ArgumentParser(description="Ensemble candidate checkpoints")
    parser.add_argument("--csv", default=str(TRAINING_ROOT / "metadata.csv"))
    parser.add_argument("--checkpoints", nargs="+", required=True)
    parser.add_argument("--output", default="checkpoints/candidates/effb4_ensemble_v1.pt")
    parser.add_argument("--experiment-name", default="effb4_ensemble_v1")
    parser.add_argument("--scheme", default="binary")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--input-size", type=int, default=380)
    parser.add_argument("--tta-rounds", type=int, default=5)
    args = parser.parse_args()

    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt_paths = [Path(p) if Path(p).is_absolute() else ML_API_ROOT / p for p in args.checkpoints]

    full_df = remap_labels(pd.read_csv(args.csv), args.scheme)
    num_classes = len(LABEL_SCHEMES[args.scheme]["names"])
    _, _, test_df = stratified_patient_split(full_df, seed=args.seed, num_classes=num_classes)
    test_ds = LiverUSCsvDataset(test_df, build_eval_transform(args.input_size))

    labels, probs = ensemble_eval(ckpt_paths, test_ds, device, args.input_size, args.tta_rounds)
    num_classes = probs.shape[1]
    test_auc = compute_val_auc(labels, probs, num_classes)
    test_acc = float((probs.argmax(axis=1) == labels).mean())
    logger.info("Ensemble test auc=%s acc=%.4f", format_auc(test_auc), test_acc)

    base = torch.load(ckpt_paths[0], map_location="cpu", weights_only=False)
    out_path = Path(args.output)
    if not out_path.is_absolute():
        out_path = ML_API_ROOT / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)

    spec = LABEL_SCHEMES[args.scheme]
    torch.save(
        {
            "ensemble": True,
            "member_checkpoints": [str(p) for p in ckpt_paths],
            "model_state": base["model_state"],
            "num_classes": len(spec["names"]),
            "class_names": spec["names"],
            "model_name": base.get("model_name", "efficientnet_b4"),
            "label_scheme": args.scheme,
            "best_val_auc": float(np.mean([torch.load(p, map_location="cpu", weights_only=False).get("best_val_auc", 0) for p in ckpt_paths])),
            "test_auc": test_auc,
            "test_acc": test_acc,
        },
        out_path,
    )

    val_auc = float(torch.load(ckpt_paths[0], map_location="cpu", weights_only=False).get("best_val_auc") or 0)
    save_candidate_metadata(
        out_path,
        version=out_path.stem,
        scheme=args.scheme,
        val_auc=val_auc,
        test_auc=test_auc,
        test_acc=test_acc,
        model_name=str(base.get("model_name", "efficientnet_b4")),
        input_size=args.input_size,
        loss="ensemble",
        seed=args.seed,
        notes=f"members={len(ckpt_paths)}",
    )
    log_experiment(args.experiment_name, val_auc, test_auc, "ensemble", f"ensemble of {len(ckpt_paths)} seeds test_acc={test_acc:.4f}")
    print(json.dumps({"checkpoint": str(out_path), "test_auc": test_auc, "test_acc": test_acc}, indent=2))

if __name__ == "__main__":
    main()
