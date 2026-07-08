#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import logging
import random
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score
from torch.cuda.amp import GradScaler, autocast
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader

from kaggle_fibrosis_dataset import (
    KaggleFibrosisDataset,
    get_kaggle_train_transform,
    get_kaggle_val_transform,
)
from model import build_model, get_optimizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TRAINING_ROOT = Path(__file__).resolve().parent
ML_API_ROOT = TRAINING_ROOT.parent
PROCESSED_DIR = ML_API_ROOT / "data/processed"
CHECKPOINT_DIR = ML_API_ROOT / "checkpoints"
DEFAULT_TRAIN_CSV = PROCESSED_DIR / "kaggle_metadata_train.csv"
DEFAULT_VAL_CSV = PROCESSED_DIR / "kaggle_metadata_val.csv"
DEFAULT_LOG_CSV = PROCESSED_DIR / "kaggle_pretrain_log.csv"
DEFAULT_CKPT = CHECKPOINT_DIR / "kaggle_pretrain_best.pt"

HARD_TIMEOUT_SEC = 7200
NUM_CLASSES = 2


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def class_weights_from_df(df: pd.DataFrame, device: torch.device) -> torch.Tensor:
    counts = torch.bincount(
        torch.tensor(df["class_id"].values, dtype=torch.long),
        minlength=NUM_CLASSES,
    ).float()
    weights = counts.sum() / (len(counts) * counts.clamp(min=1))
    return weights.to(device)


@torch.no_grad()
def evaluate_val_auc(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    use_amp: bool,
) -> tuple[float, float]:
    model.eval()
    total_loss = 0.0
    all_labels: list[int] = []
    all_probs: list[float] = []

    for images, labels in loader:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)
        with autocast(enabled=use_amp):
            logits = model(images)
            loss = criterion(logits, labels)
        total_loss += loss.item()

        probs = torch.softmax(logits, dim=1)[:, 1].detach().cpu().numpy()
        all_probs.extend(probs.tolist())
        all_labels.extend(labels.cpu().numpy().tolist())

    avg_loss = total_loss / max(len(loader), 1)
    if len(set(all_labels)) < 2:
        val_auc = 0.0
    else:
        val_auc = float(roc_auc_score(all_labels, all_probs))
    return avg_loss, val_auc


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    scaler: GradScaler,
    device: torch.device,
    use_amp: bool,
) -> float:
    model.train()
    total_loss = 0.0

    for images, labels in loader:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)
        with autocast(enabled=use_amp):
            logits = model(images)
            loss = criterion(logits, labels)

        scaler.scale(loss).backward()
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(optimizer)
        scaler.update()

        total_loss += loss.item()

    return total_loss / max(len(loader), 1)


def append_log_row(log_path: Path, row: dict) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not log_path.exists()
    with log_path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["epoch", "train_loss", "val_auc", "elapsed_sec"])
        if write_header:
            writer.writeheader()
        writer.writerow(row)


def save_checkpoint(
    path: Path,
    model: nn.Module,
    epoch: int,
    val_auc: float,
    train_loss: float,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "epoch": epoch,
            "model_state": model.state_dict(),
            "best_val_auc": val_auc,
            "train_loss": train_loss,
            "num_classes": NUM_CLASSES,
            "task": "kaggle_fibrosis_binary",
            "pretrained_backbone": True,
        },
        path,
    )
    logger.info("Saved checkpoint %s (val_auc=%.4f)", path, val_auc)


def print_summary(best_epoch: int, best_val_auc: float, total_sec: float, log_path: Path) -> None:
    print("\n" + "=" * 48)
    print("KAGGLE PRETRAIN SUMMARY")
    print("=" * 48)
    print(f"best_epoch     : {best_epoch}")
    print(f"best_val_auc   : {best_val_auc:.4f}")
    print(f"total_time_sec : {total_sec:.1f}")
    print(f"log_csv        : {log_path}")
    print("=" * 48)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-csv", default=str(DEFAULT_TRAIN_CSV))
    parser.add_argument("--val-csv", default=str(DEFAULT_VAL_CSV))
    parser.add_argument("--log-csv", default=str(DEFAULT_LOG_CSV))
    parser.add_argument("--checkpoint", default=str(DEFAULT_CKPT))
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--patience", type=int, default=2)
    parser.add_argument("--num-workers", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--timeout-sec", type=int, default=HARD_TIMEOUT_SEC)
    args = parser.parse_args()

    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_amp = device.type == "cuda"
    logger.info("Device: %s", device)
    if device.type == "cuda":
        logger.info("GPU: %s", torch.cuda.get_device_name(0))

    train_csv = Path(args.train_csv)
    val_csv = Path(args.val_csv)
    if not train_csv.exists() or not val_csv.exists():
        raise SystemExit(f"Missing CSV splits. Run kaggle_fibrosis_dataset.py first.\n  {train_csv}\n  {val_csv}")

    train_ds = KaggleFibrosisDataset(train_csv, transform=get_kaggle_train_transform())
    val_ds = KaggleFibrosisDataset(val_csv, transform=get_kaggle_val_transform())
    logger.info("Train: %s | Val: %s", len(train_ds), len(val_ds))

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        pin_memory=use_amp,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=use_amp,
    )

    model = build_model(num_classes=NUM_CLASSES, pretrained=True).to(device)
    weights = class_weights_from_df(train_ds.df, device)
    criterion = nn.CrossEntropyLoss(weight=weights)
    optimizer = get_optimizer(model, lr=args.lr, weight_decay=args.weight_decay)
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs)
    scaler = GradScaler(enabled=use_amp)

    log_path = Path(args.log_csv)
    ckpt_path = Path(args.checkpoint)
    if log_path.exists():
        log_path.unlink()

    best_val_auc = -1.0
    best_epoch = -1
    patience_counter = 0
    t0 = time.time()
    timed_out = False

    for epoch in range(args.epochs):
        elapsed = time.time() - t0
        if elapsed >= args.timeout_sec:
            logger.warning("HARD TIMEOUT (%.0fs >= %ss). Stopping.", elapsed, args.timeout_sec)
            timed_out = True
            break

        train_loss = train_one_epoch(
            model, train_loader, criterion, optimizer, scaler, device, use_amp
        )
        val_loss, val_auc = evaluate_val_auc(
            model, val_loader, criterion, device, use_amp
        )
        scheduler.step()

        elapsed = time.time() - t0
        logger.info(
            "Epoch %d/%d | train_loss=%.4f val_loss=%.4f val_auc=%.4f | elapsed=%.0fs",
            epoch + 1,
            args.epochs,
            train_loss,
            val_loss,
            val_auc,
            elapsed,
        )
        append_log_row(
            log_path,
            {
                "epoch": epoch + 1,
                "train_loss": f"{train_loss:.6f}",
                "val_auc": f"{val_auc:.6f}",
                "elapsed_sec": f"{elapsed:.1f}",
            },
        )

        if val_auc > best_val_auc:
            best_val_auc = val_auc
            best_epoch = epoch + 1
            patience_counter = 0
            save_checkpoint(ckpt_path, model, epoch, val_auc, train_loss)
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                logger.info("Early stopping (patience=%d)", args.patience)
                break

        if device.type == "cuda":
            torch.cuda.empty_cache()

        if time.time() - t0 >= args.timeout_sec:
            logger.warning("HARD TIMEOUT after epoch %d. Stopping.", epoch + 1)
            timed_out = True
            break

    total_sec = time.time() - t0
    if best_epoch < 0:
        logger.error("No checkpoint saved (val AUC never improved).")
    print_summary(best_epoch, best_val_auc, total_sec, log_path)
    if timed_out:
        print("NOTE: stopped due to 2h HARD TIMEOUT")


if __name__ == "__main__":
    main()
