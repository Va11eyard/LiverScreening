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
import torch.nn as nn
from sklearn.metrics import roc_auc_score
from torch.cuda.amp import GradScaler
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader

from patient_split import StratifiedSplitError, stratified_patient_split
from train import (
    DEFAULT_INPUT_SIZE,
    EARLY_STOP_PATIENCE,
    LABEL_SMOOTHING,
    MIXUP_ALPHA,
    TTA_ROUNDS,
    WARMUP_EPOCHS,
    LiverUSCsvDataset,
    build_eval_transform,
    build_optimizer,
    build_train_transform,
    evaluate_probs,
    evaluate_tta,
    format_auc,
    macro_auc,
    make_weighted_sampler,
    set_backbone_trainable,
    set_seed,
    should_save_checkpoint,
    train_one_epoch,
    val_accuracy,
    warn_missing_split_classes,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TRAINING_ROOT = Path(__file__).resolve().parent
ML_API_ROOT = TRAINING_ROOT.parent
CANDIDATES_DIR = ML_API_ROOT / "checkpoints" / "candidates"

LABEL_SCHEMES: dict[str, dict] = {
    "4class": {
        "map": {0: 0, 1: 1, 2: 2, 3: 3},
        "names": ("normal", "steatosis", "fibrosis", "cirrhosis"),
    },
    "binary": {
        "map": {0: 0, 1: 0, 2: 1, 3: 1},
        "names": ("low_risk", "high_risk"),
    },
    "3class": {
        "map": {0: 0, 1: 1, 2: 2, 3: 2},
        "names": ("normal", "steatosis", "advanced"),
    },
}

class FocalLoss(nn.Module):
    def __init__(self, gamma: float = 2.0, weight: torch.Tensor | None = None):
        super().__init__()
        self.gamma = gamma
        self.weight = weight

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        ce = nn.functional.cross_entropy(logits, targets, weight=self.weight, reduction="none")
        pt = torch.exp(-ce)
        return ((1 - pt) ** self.gamma * ce).mean()

def remap_labels(df: pd.DataFrame, scheme: str) -> pd.DataFrame:
    spec = LABEL_SCHEMES[scheme]
    out = df.copy()
    out["label"] = out["label"].astype(int).map(spec["map"])
    return out

def build_model(model_name: str, num_classes: int) -> nn.Module:
    return timm.create_model(model_name, pretrained=True, num_classes=num_classes, in_chans=3)

def binary_macro_auc(y_true: np.ndarray, y_prob: np.ndarray) -> float | None:
    if len(np.unique(y_true)) < 2:
        return None
    scores = y_prob[:, 1]
    if not np.isfinite(scores).all():
        return None
    return float(roc_auc_score(y_true, scores))

def compute_val_auc(y_true: np.ndarray, y_prob: np.ndarray, num_classes: int) -> float | None:
    if num_classes == 2:
        return binary_macro_auc(y_true, y_prob)
    return macro_auc(y_true, y_prob, num_classes=num_classes)

def save_candidate_metadata(
    ckpt_path: Path,
    *,
    version: str,
    scheme: str,
    val_auc: float | None,
    test_auc: float | None,
    test_acc: float,
    model_name: str,
    input_size: int,
    loss: str,
    seed: int,
    notes: str = "",
) -> None:
    spec = LABEL_SCHEMES[scheme]
    meta = {
        "version": version,
        "val_auc": val_auc,
        "test_auc": test_auc,
        "test_acc": test_acc,
        "classes": len(spec["names"]),
        "class_names": list(spec["names"]),
        "label_scheme": scheme,
        "model_name": model_name,
        "input_size": input_size,
        "loss": loss,
        "seed": seed,
        "date": date.today().isoformat(),
        "status": "candidate",
        "notes": notes,
    }
    sidecar = ckpt_path.with_suffix(".metadata.json")
    with sidecar.open("w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

def patch_save_checkpoint(
    path: Path,
    model: nn.Module,
    epoch: int,
    metric_name: str,
    metric_value: float,
    phase: str,
    *,
    scheme: str,
    model_name: str,
) -> None:
    spec = LABEL_SCHEMES[scheme]
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "epoch": epoch,
            "phase": phase,
            "model_state": model.state_dict(),
            "best_metric_name": metric_name,
            "best_metric_value": metric_value,
            "best_val_auc": metric_value if metric_name == "auc" else None,
            "num_classes": len(spec["names"]),
            "class_names": spec["names"],
            "model_name": model_name,
            "label_scheme": scheme,
            "pretrained_source": "imagenet-1k",
        },
        path,
    )
    logger.info("Saved checkpoint %s (%s=%.4f)", path, metric_name, metric_value)

def log_experiment(name: str, val_auc: float, test_auc: float | None, model: str, notes: str) -> None:
    cmd = [
        sys.executable,
        str(TRAINING_ROOT / "log_experiment.py"),
        "add",
        "--name",
        name,
        "--val-auc",
        str(val_auc),
        "--model",
        model,
        "--notes",
        notes,
    ]
    if test_auc is not None:
        cmd.extend(["--test-auc", str(test_auc)])
    subprocess.run(cmd, check=False)

def train_candidate(args: argparse.Namespace) -> dict:
    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_amp = device.type == "cuda"
    logger.info("Device: %s | scheme=%s model=%s loss=%s size=%s", device, args.scheme, args.model, args.loss, args.input_size)

    spec = LABEL_SCHEMES[args.scheme]
    num_classes = len(spec["names"])

    full_df = remap_labels(pd.read_csv(args.csv), args.scheme)
    try:
        train_df, val_df, test_df = stratified_patient_split(full_df, seed=args.seed, num_classes=num_classes)
    except StratifiedSplitError as exc:
        raise SystemExit(str(exc)) from exc

    warn_missing_split_classes(train_df, val_df, test_df)

    train_ds = LiverUSCsvDataset(train_df, build_train_transform(args.input_size))
    val_ds = LiverUSCsvDataset(val_df, build_eval_transform(args.input_size))
    test_ds = LiverUSCsvDataset(test_df, build_eval_transform(args.input_size))

    train_labels = train_df["label"].to_numpy(dtype=np.int64)
    counts = np.bincount(train_labels, minlength=num_classes).astype(np.float64)
    counts = np.clip(counts, 1.0, None)
    sample_weights = 1.0 / counts[train_labels]
    from torch.utils.data import WeightedRandomSampler

    train_sampler = WeightedRandomSampler(
        weights=torch.as_tensor(sample_weights, dtype=torch.double),
        num_samples=len(train_labels),
        replacement=True,
    )
    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        sampler=train_sampler,
        num_workers=args.num_workers,
        pin_memory=use_amp,
    )
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=args.num_workers)
    test_loader = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False, num_workers=args.num_workers)

    model = build_model(args.model, num_classes).to(device)
    if args.loss == "focal":
        criterion: nn.Module = FocalLoss(gamma=2.0)
    else:
        criterion = nn.CrossEntropyLoss(label_smoothing=LABEL_SMOOTHING)

    ckpt_path = Path(args.checkpoint)
    if not ckpt_path.is_absolute():
        ckpt_path = ML_API_ROOT / ckpt_path
    ckpt_path.parent.mkdir(parents=True, exist_ok=True)

    scaler = GradScaler(enabled=use_amp)
    best_val_auc = -1.0
    best_val_acc = -1.0
    best_epoch = 0
    best_metric_name = "auc"
    patience_counter = 0
    global_epoch = 0

    def maybe_save(val_auc: float | None, val_acc: float, phase: str) -> None:
        nonlocal best_val_auc, best_val_acc, best_epoch, best_metric_name, patience_counter
        improved, metric_name = should_save_checkpoint(val_auc, val_acc, best_val_auc, best_val_acc)
        if improved:
            if metric_name == "auc" and val_auc is not None:
                best_val_auc = val_auc
            elif metric_name == "acc":
                best_val_acc = val_acc
            best_epoch = global_epoch
            best_metric_name = metric_name
            patience_counter = 0
            metric_value = val_auc if metric_name == "auc" and val_auc is not None else val_acc
            patch_save_checkpoint(
                ckpt_path,
                model,
                global_epoch,
                metric_name,
                float(metric_value),
                phase,
                scheme=args.scheme,
                model_name=args.model,
            )
        else:
            patience_counter += 1

    set_backbone_trainable(model, trainable=False)
    optimizer = build_optimizer(model, args.backbone_lr, args.head_lr, args.weight_decay, head_only=True)
    warmup_epochs = min(args.warmup_epochs, args.epochs)
    scheduler = CosineAnnealingLR(optimizer, T_max=max(warmup_epochs, 1))

    for epoch in range(warmup_epochs):
        global_epoch += 1
        train_loss = train_one_epoch(model, train_loader, criterion, optimizer, scaler, device, use_amp, args.mixup_alpha)
        y_true, y_prob, val_loss = evaluate_probs(model, val_loader, device, use_amp)
        val_auc = compute_val_auc(y_true, y_prob, num_classes)
        val_acc = val_accuracy(y_true, y_prob)
        scheduler.step()
        logger.info(
            "Warmup %s/%s | train_loss=%.4f val_loss=%.4f val_auc=%s val_acc=%.4f",
            epoch + 1,
            warmup_epochs,
            train_loss,
            val_loss,
            format_auc(val_auc),
            val_acc,
        )
        maybe_save(val_auc, val_acc, "warmup")
        if patience_counter >= args.patience:
            break

    finetune_epochs = max(args.epochs - warmup_epochs, 0)
    if finetune_epochs > 0 and patience_counter < args.patience:
        set_backbone_trainable(model, trainable=True)
        optimizer = build_optimizer(model, args.backbone_lr, args.head_lr, args.weight_decay, head_only=False)
        scheduler = CosineAnnealingLR(optimizer, T_max=max(finetune_epochs, 1))
        patience_counter = 0

        for epoch in range(finetune_epochs):
            global_epoch += 1
            train_loss = train_one_epoch(model, train_loader, criterion, optimizer, scaler, device, use_amp, args.mixup_alpha)
            y_true, y_prob, val_loss = evaluate_probs(model, val_loader, device, use_amp)
            val_auc = compute_val_auc(y_true, y_prob, num_classes)
            val_acc = val_accuracy(y_true, y_prob)
            scheduler.step()
            logger.info(
                "Finetune %s/%s | train_loss=%.4f val_loss=%.4f val_auc=%s val_acc=%.4f",
                epoch + 1,
                finetune_epochs,
                train_loss,
                val_loss,
                format_auc(val_auc),
                val_acc,
            )
            maybe_save(val_auc, val_acc, "finetune")
            if patience_counter >= args.patience:
                logger.info("Early stopping at epoch %s", global_epoch)
                break

    if ckpt_path.exists():
        state = torch.load(ckpt_path, map_location=device, weights_only=False)
        model.load_state_dict(state["model_state"])
        best_val_auc = float(state.get("best_val_auc") or state.get("best_metric_value") or best_val_auc)

    test_labels, test_probs = evaluate_tta(
        model,
        test_ds,
        device,
        use_amp,
        tta_rounds=args.tta_rounds,
        input_size=args.input_size,
    )
    test_auc = compute_val_auc(test_labels, test_probs, num_classes)
    test_acc = float((test_probs.argmax(axis=1) == test_labels).mean())
    logger.info("Test TTA×%s | auc=%s acc=%.4f (best epoch=%s)", args.tta_rounds, format_auc(test_auc), test_acc, best_epoch)

    version = ckpt_path.stem
    save_candidate_metadata(
        ckpt_path,
        version=version,
        scheme=args.scheme,
        val_auc=best_val_auc if best_val_auc >= 0 else None,
        test_auc=test_auc,
        test_acc=test_acc,
        model_name=args.model,
        input_size=args.input_size,
        loss=args.loss,
        seed=args.seed,
        notes=args.experiment_name,
    )
    log_experiment(
        args.experiment_name,
        best_val_auc if best_val_auc >= 0 else 0.0,
        test_auc,
        args.model,
        f"scheme={args.scheme} loss={args.loss} seed={args.seed} acc={test_acc:.4f}",
    )

    return {
        "checkpoint": str(ckpt_path),
        "val_auc": best_val_auc,
        "test_auc": test_auc,
        "test_acc": test_acc,
        "scheme": args.scheme,
        "model": args.model,
    }

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train candidate model (candidates/ only)")
    parser.add_argument("--csv", default=str(TRAINING_ROOT / "metadata.csv"))
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--experiment-name", required=True)
    parser.add_argument("--scheme", choices=sorted(LABEL_SCHEMES), default="binary")
    parser.add_argument("--model", default="efficientnet_b4")
    parser.add_argument("--loss", choices=("ce", "focal"), default="ce")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--warmup-epochs", type=int, default=WARMUP_EPOCHS)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--num-workers", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--input-size", type=int, default=DEFAULT_INPUT_SIZE)
    parser.add_argument("--head-lr", type=float, default=1e-3)
    parser.add_argument("--backbone-lr", type=float, default=1e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--mixup-alpha", type=float, default=MIXUP_ALPHA)
    parser.add_argument("--patience", type=int, default=EARLY_STOP_PATIENCE)
    parser.add_argument("--tta-rounds", type=int, default=TTA_ROUNDS)
    return parser

def main() -> None:
    args = build_parser().parse_args()
    result = train_candidate(args)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
