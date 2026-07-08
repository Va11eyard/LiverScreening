#!/usr/bin/env python3
from __future__ import annotations

import argparse
import logging
import random
from pathlib import Path

import numpy as np
import torch
import yaml
from sklearn.metrics import balanced_accuracy_score, f1_score
from torch.cuda.amp import GradScaler, autocast
from torch.utils.data import DataLoader

from dataset import LiverUSDataset, train_transform, val_transform
from model import build_model, get_loss_function, get_optimizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def train_epoch(model, loader, criterion, optimizer, scaler, device, use_amp, grad_clip, accum):
    model.train()
    total_loss = 0.0
    all_preds, all_labels = [], []

    optimizer.zero_grad()
    for step, (images, labels) in enumerate(loader):
        images, labels = images.to(device), labels.to(device)
        with autocast(enabled=use_amp):
            outputs = model(images)
            loss = criterion(outputs, labels) / accum
        scaler.scale(loss).backward()

        if (step + 1) % accum == 0 or (step + 1) == len(loader):
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad()

        total_loss += loss.item() * accum
        preds = outputs.argmax(dim=1).detach().cpu().numpy()
        all_preds.extend(preds)
        all_labels.extend(labels.cpu().numpy())

    acc = balanced_accuracy_score(all_labels, all_preds)
    f1 = f1_score(all_labels, all_preds, average="weighted", zero_division=0)
    return total_loss / max(len(loader), 1), acc, f1


@torch.no_grad()
def validate(model, loader, criterion, device, use_amp):
    model.eval()
    total_loss = 0.0
    all_preds, all_labels = [], []
    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        with autocast(enabled=use_amp):
            outputs = model(images)
            loss = criterion(outputs, labels)
        total_loss += loss.item()
        preds = outputs.argmax(dim=1).cpu().numpy()
        all_preds.extend(preds)
        all_labels.extend(labels.cpu().numpy())
    acc = balanced_accuracy_score(all_labels, all_preds)
    f1 = f1_score(all_labels, all_preds, average="weighted", zero_division=0)
    return total_loss / max(len(loader), 1), acc, f1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(ROOT / "config.yaml"))
    args = parser.parse_args()

    with open(args.config, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    set_seed(int(config["seed"]))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Device: %s", device)
    if device.type == "cuda":
        logger.info("GPU: %s", torch.cuda.get_device_name(0))

    train_ds = LiverUSDataset(config["csv_train"], transform=train_transform)
    val_ds = LiverUSDataset(config["csv_val"], transform=val_transform)
    train_loader = DataLoader(
        train_ds,
        batch_size=int(config["batch_size"]),
        shuffle=True,
        num_workers=int(config["num_workers"]),
        pin_memory=device.type == "cuda",
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=int(config["batch_size"]),
        shuffle=False,
        num_workers=int(config["num_workers"]),
        pin_memory=device.type == "cuda",
    )
    logger.info("Train: %s, Val: %s", len(train_ds), len(val_ds))

    model = build_model(num_classes=int(config["num_classes"])).to(device)
    counts = torch.bincount(torch.tensor(train_ds.df["class_id"].values), minlength=int(config["num_classes"]))
    weights = (counts.sum() / (len(counts) * counts.float().clamp(min=1))).to(device)
    criterion = get_loss_function(weights)
    optimizer = get_optimizer(model, lr=float(config["lr"]), weight_decay=float(config["weight_decay"]))
    scaler = GradScaler(enabled=bool(config["use_amp"]))
    accum = int(config.get("gradient_accumulation", 1))

    save_dir = Path(config["save_dir"])
    if not save_dir.is_absolute():
        save_dir = ROOT / save_dir
    save_dir.mkdir(parents=True, exist_ok=True)

    best_f1 = 0.0
    patience = 0
    for epoch in range(int(config["epochs"])):
        tr_loss, tr_acc, tr_f1 = train_epoch(
            model, train_loader, criterion, optimizer, scaler, device,
            bool(config["use_amp"]), float(config["grad_clip"]), accum,
        )
        va_loss, va_acc, va_f1 = validate(model, val_loader, criterion, device, bool(config["use_amp"]))
        logger.info(
            "Epoch %s/%s train loss=%.4f acc=%.4f f1=%.4f | val loss=%.4f acc=%.4f f1=%.4f",
            epoch + 1, config["epochs"], tr_loss, tr_acc, tr_f1, va_loss, va_acc, va_f1,
        )
        if va_f1 > best_f1:
            best_f1 = va_f1
            patience = 0
            ckpt = save_dir / "liver_efficientnet_b3_best.pth"
            torch.save(
                {"epoch": epoch, "model_state": model.state_dict(), "best_f1": best_f1, "config": config},
                ckpt,
            )
            logger.info("Saved %s (f1=%.4f)", ckpt, best_f1)
        else:
            patience += 1
            if patience >= int(config["early_stopping_patience"]):
                logger.info("Early stopping")
                break

    logger.info("Done. Best val F1: %.4f", best_f1)


if __name__ == "__main__":
    main()
