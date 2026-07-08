#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import logging
import random
from pathlib import Path

import numpy as np
import pandas as pd
import timm
import torch
import torch.nn as nn
from PIL import Image
from sklearn.metrics import roc_auc_score
from torch.cuda.amp import GradScaler, autocast
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms

from patient_split import StratifiedSplitError, stratified_patient_split

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TRAINING_ROOT = Path(__file__).resolve().parent
ML_API_ROOT = TRAINING_ROOT.parent
DEFAULT_CHECKPOINT = ML_API_ROOT / "checkpoints/effb4_step3.pt"

NUM_CLASSES = 4
CLASS_NAMES = ("normal", "steatosis", "fibrosis", "cirrhosis")
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
DEFAULT_INPUT_SIZE = 380
WARMUP_EPOCHS = 5
MIXUP_ALPHA = 0.4
LABEL_SMOOTHING = 0.05
EARLY_STOP_PATIENCE = 7
TTA_ROUNDS = 5

def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

def patient_group_hash(patient_id: str) -> str:
    return hashlib.sha256(str(patient_id).encode("utf-8")).hexdigest()

def split_hash_groups(
    df: pd.DataFrame,
    seed: int = 42,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    return stratified_patient_split(df, seed=seed)

def macro_auc(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    num_classes: int = NUM_CLASSES,
) -> float | None:
    present = sorted(int(c) for c in np.unique(y_true))
    if len(present) < 2:
        return None
    aucs: list[float] = []
    for class_id in present:
        binary = (y_true == class_id).astype(int)
        if binary.sum() == 0 or binary.sum() == len(binary):
            continue
        aucs.append(float(roc_auc_score(binary, y_prob[:, class_id])))
    if not aucs:
        return None
    return float(np.mean(aucs))

def val_accuracy(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    preds = y_prob.argmax(axis=1)
    return float((preds == y_true).mean())

def warn_missing_split_classes(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> None:
    for name, part in [("train", train_df), ("val", val_df), ("test", test_df)]:
        patient_labels = (
            part.groupby("patient_id")["label"].agg(lambda s: int(s.mode().iloc[0])).unique()
        )
        image_labels = part["label"].astype(int).unique()
        missing_patients = set(range(NUM_CLASSES)) - set(patient_labels)
        missing_images = set(range(NUM_CLASSES)) - set(image_labels)
        if missing_patients:
            names = [CLASS_NAMES[i] for i in sorted(missing_patients)]
            logger.warning("%s split missing patient-level classes: %s", name, names)
        if missing_images:
            names = [CLASS_NAMES[i] for i in sorted(missing_images)]
            logger.warning("%s split missing image-level classes: %s", name, names)

def format_auc(val: float | None) -> str:
    return f"{val:.4f}" if val is not None else "n/a"

def should_save_checkpoint(
    val_auc: float | None,
    val_acc: float,
    best_val_auc: float,
    best_val_acc: float,
) -> tuple[bool, str]:
    if val_auc is not None and val_auc > best_val_auc:
        return True, "auc"
    if val_auc is None and val_acc > best_val_acc:
        return True, "acc"
    return False, ""

def load_us_image(path: str) -> Image.Image:
    return Image.open(path).convert("L").convert("RGB")

def build_train_transform(input_size: int) -> transforms.Compose:
    return transforms.Compose(
        [
            transforms.Resize((input_size + 32, input_size + 32)),
            transforms.RandomCrop(input_size),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1, hue=0.02),
            transforms.RandomRotation(10),
            transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 1.0)),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )

def build_eval_transform(input_size: int) -> transforms.Compose:
    return transforms.Compose(
        [
            transforms.Resize((input_size, input_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )

def build_tta_transform(input_size: int) -> transforms.Compose:
    return transforms.Compose(
        [
            transforms.Resize((input_size + 32, input_size + 32)),
            transforms.RandomCrop(input_size),
            transforms.RandomHorizontalFlip(),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )

class LiverUSCsvDataset(Dataset):
    def __init__(self, frame: pd.DataFrame, transform: transforms.Compose):
        self.df = frame.reset_index(drop=True)
        self.transform = transform

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        row = self.df.iloc[idx]
        image = load_us_image(row["path"])
        image = self.transform(image)
        label = int(row["label"])
        return image, torch.tensor(label, dtype=torch.long)

def build_model(num_classes: int = NUM_CLASSES) -> nn.Module:
    return timm.create_model(
        "efficientnet_b4",
        pretrained=True,
        num_classes=num_classes,
        in_chans=3,
    )

def iter_params(model: nn.Module) -> tuple[list[nn.Parameter], list[nn.Parameter]]:
    backbone_params: list[nn.Parameter] = []
    head_params: list[nn.Parameter] = []
    for name, param in model.named_parameters():
        if "classifier" in name or "head" in name or "fc" in name:
            head_params.append(param)
        else:
            backbone_params.append(param)
    return backbone_params, head_params

def set_backbone_trainable(model: nn.Module, trainable: bool) -> None:
    backbone_params, head_params = iter_params(model)
    for param in backbone_params:
        param.requires_grad = trainable
    for param in head_params:
        param.requires_grad = True

def build_optimizer(
    model: nn.Module,
    backbone_lr: float,
    head_lr: float,
    weight_decay: float,
    head_only: bool,
) -> torch.optim.Optimizer:
    backbone_params, head_params = iter_params(model)
    if head_only:
        return torch.optim.AdamW(head_params, lr=head_lr, weight_decay=weight_decay)
    return torch.optim.AdamW(
        [
            {"params": backbone_params, "lr": backbone_lr},
            {"params": head_params, "lr": head_lr},
        ],
        weight_decay=weight_decay,
    )

def make_weighted_sampler(labels: np.ndarray) -> WeightedRandomSampler:
    counts = np.bincount(labels, minlength=NUM_CLASSES).astype(np.float64)
    counts = np.clip(counts, 1.0, None)
    sample_weights = 1.0 / counts[labels]
    return WeightedRandomSampler(
        weights=torch.as_tensor(sample_weights, dtype=torch.double),
        num_samples=len(labels),
        replacement=True,
    )

def mixup_batch(
    images: torch.Tensor,
    labels: torch.Tensor,
    alpha: float,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, float]:
    if alpha <= 0:
        return images, labels, labels, 1.0
    lam = float(np.random.beta(alpha, alpha))
    index = torch.randperm(images.size(0), device=images.device)
    mixed_images = lam * images + (1.0 - lam) * images[index]
    return mixed_images, labels, labels[index], lam

def mixup_loss(
    criterion: nn.Module,
    logits: torch.Tensor,
    targets_a: torch.Tensor,
    targets_b: torch.Tensor,
    lam: float,
) -> torch.Tensor:
    return lam * criterion(logits, targets_a) + (1.0 - lam) * criterion(logits, targets_b)

def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    scaler: GradScaler,
    device: torch.device,
    use_amp: bool,
    mixup_alpha: float,
) -> float:
    model.train()
    total_loss = 0.0
    for images, labels in loader:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)
        images, targets_a, targets_b, lam = mixup_batch(images, labels, mixup_alpha)

        optimizer.zero_grad(set_to_none=True)
        with autocast(enabled=use_amp):
            logits = model(images)
            loss = mixup_loss(criterion, logits, targets_a, targets_b, lam)
        scaler.scale(loss).backward()
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(optimizer)
        scaler.update()
        total_loss += loss.item()
    return total_loss / max(len(loader), 1)

@torch.no_grad()
def evaluate_probs(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
    use_amp: bool,
) -> tuple[np.ndarray, np.ndarray, float]:
    model.eval()
    all_labels: list[int] = []
    all_probs: list[np.ndarray] = []
    total_loss = 0.0
    criterion = nn.CrossEntropyLoss(label_smoothing=LABEL_SMOOTHING)
    for images, labels in loader:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)
        with autocast(enabled=use_amp):
            logits = model(images)
            loss = criterion(logits, labels)
        probs = torch.softmax(logits, dim=1).cpu().numpy()
        all_probs.append(probs)
        all_labels.extend(labels.cpu().numpy().tolist())
        total_loss += loss.item()
    y_true = np.asarray(all_labels, dtype=np.int64)
    y_prob = np.concatenate(all_probs, axis=0)
    return y_true, y_prob, total_loss / max(len(loader), 1)

@torch.no_grad()
def evaluate_tta(
    model: nn.Module,
    dataset: LiverUSCsvDataset,
    device: torch.device,
    use_amp: bool,
    tta_rounds: int,
    input_size: int,
) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    tta_transform = build_tta_transform(input_size)
    labels: list[int] = []
    prob_sum: list[np.ndarray] = []

    for idx in range(len(dataset)):
        row = dataset.df.iloc[idx]
        labels.append(int(row["label"]))
        image = load_us_image(row["path"])
        round_probs = []
        for _ in range(tta_rounds):
            tensor = tta_transform(image).unsqueeze(0).to(device)
            with autocast(enabled=use_amp):
                logits = model(tensor)
            round_probs.append(torch.softmax(logits, dim=1).cpu().numpy()[0])
        prob_sum.append(np.mean(round_probs, axis=0))

    return np.asarray(labels, dtype=np.int64), np.stack(prob_sum, axis=0)

def save_checkpoint(
    path: Path,
    model: nn.Module,
    epoch: int,
    metric_name: str,
    metric_value: float,
    phase: str,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "epoch": epoch,
            "phase": phase,
            "model_state": model.state_dict(),
            "best_metric_name": metric_name,
            "best_metric_value": metric_value,
            "best_val_auc": metric_value if metric_name == "auc" else None,
            "num_classes": NUM_CLASSES,
            "class_names": CLASS_NAMES,
            "model_name": "efficientnet_b4",
            "pretrained_source": "imagenet-1k",
        },
        path,
    )
    logger.info("Saved checkpoint %s (%s=%.4f)", path, metric_name, metric_value)

def print_split_summary(train_df: pd.DataFrame, val_df: pd.DataFrame, test_df: pd.DataFrame) -> None:
    for name, part in [("train", train_df), ("val", val_df), ("test", test_df)]:
        patients = part["patient_id"].nunique()
        counts = part["label"].value_counts().sort_index().to_dict()
        logger.info("%s: images=%s patients=%s labels=%s", name, len(part), patients, counts)

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="CSV with path,label,patient_id")
    parser.add_argument("--checkpoint", default=str(DEFAULT_CHECKPOINT))
    parser.add_argument("--epochs", type=int, default=50)
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
    args = parser.parse_args()

    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_amp = device.type == "cuda"
    logger.info("Device: %s", device)
    if device.type == "cuda":
        logger.info("GPU: %s", torch.cuda.get_device_name(0))

    full_df = pd.read_csv(args.csv)
    try:
        train_df, val_df, test_df = split_hash_groups(full_df, seed=args.seed)
    except StratifiedSplitError as exc:
        raise SystemExit(str(exc)) from exc
    print_split_summary(train_df, val_df, test_df)
    warn_missing_split_classes(train_df, val_df, test_df)

    train_ds = LiverUSCsvDataset(train_df, build_train_transform(args.input_size))
    val_ds = LiverUSCsvDataset(val_df, build_eval_transform(args.input_size))
    test_ds = LiverUSCsvDataset(test_df, build_eval_transform(args.input_size))

    train_labels = train_df["label"].to_numpy(dtype=np.int64)
    train_sampler = make_weighted_sampler(train_labels)
    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        sampler=train_sampler,
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

    model = build_model().to(device)
    criterion = nn.CrossEntropyLoss(label_smoothing=LABEL_SMOOTHING)
    scaler = GradScaler(enabled=use_amp)
    ckpt_path = Path(args.checkpoint)

    best_val_auc = -1.0
    best_val_acc = -1.0
    best_epoch = -1
    best_metric_name = ""
    patience_counter = 0
    global_epoch = 0

    set_backbone_trainable(model, trainable=False)
    optimizer = build_optimizer(
        model,
        backbone_lr=args.backbone_lr,
        head_lr=args.head_lr,
        weight_decay=args.weight_decay,
        head_only=True,
    )
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs)

    for epoch in range(args.warmup_epochs):
        global_epoch += 1
        train_loss = train_one_epoch(
            model, train_loader, criterion, optimizer, scaler, device, use_amp, args.mixup_alpha
        )
        y_true, y_prob, val_loss = evaluate_probs(model, val_loader, device, use_amp)
        val_auc = macro_auc(y_true, y_prob)
        val_acc = val_accuracy(y_true, y_prob)
        scheduler.step()
        logger.info(
            "Warmup %s/%s | train_loss=%.4f val_loss=%.4f val_macro_auc=%s val_acc=%.4f",
            epoch + 1,
            args.warmup_epochs,
            train_loss,
            val_loss,
            format_auc(val_auc),
            val_acc,
        )
        improved, metric_name = should_save_checkpoint(val_auc, val_acc, best_val_auc, best_val_acc)
        if improved:
            if metric_name == "auc" and val_auc is not None:
                best_val_auc = val_auc
            elif metric_name == "acc":
                best_val_acc = val_acc
            best_epoch = global_epoch
            best_metric_name = metric_name
            patience_counter = 0
            metric_value = val_auc if metric_name == "auc" else val_acc
            save_checkpoint(ckpt_path, model, global_epoch, metric_name, metric_value, phase="warmup")
        else:
            patience_counter += 1

    set_backbone_trainable(model, trainable=True)
    finetune_epochs = max(args.epochs - args.warmup_epochs, 1)
    patience_counter = 0
    optimizer = build_optimizer(
        model,
        backbone_lr=args.backbone_lr,
        head_lr=args.head_lr,
        weight_decay=args.weight_decay,
        head_only=False,
    )
    scheduler = CosineAnnealingLR(optimizer, T_max=finetune_epochs)

    for epoch in range(finetune_epochs):
        global_epoch += 1
        train_loss = train_one_epoch(
            model, train_loader, criterion, optimizer, scaler, device, use_amp, args.mixup_alpha
        )
        y_true, y_prob, val_loss = evaluate_probs(model, val_loader, device, use_amp)
        val_auc = macro_auc(y_true, y_prob)
        val_acc = val_accuracy(y_true, y_prob)
        scheduler.step()
        logger.info(
            "Finetune %s/%s | train_loss=%.4f val_loss=%.4f val_macro_auc=%s val_acc=%.4f",
            epoch + 1,
            finetune_epochs,
            train_loss,
            val_loss,
            format_auc(val_auc),
            val_acc,
        )
        improved, metric_name = should_save_checkpoint(val_auc, val_acc, best_val_auc, best_val_acc)
        if improved:
            if metric_name == "auc" and val_auc is not None:
                best_val_auc = val_auc
            elif metric_name == "acc":
                best_val_acc = val_acc
            best_epoch = global_epoch
            best_metric_name = metric_name
            patience_counter = 0
            metric_value = val_auc if metric_name == "auc" else val_acc
            save_checkpoint(ckpt_path, model, global_epoch, metric_name, metric_value, phase="finetune")
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                logger.info("Early stopping at epoch %s (patience=%s)", global_epoch, args.patience)
                break

    if ckpt_path.exists():
        state = torch.load(ckpt_path, map_location=device, weights_only=False)
        model.load_state_dict(state["model_state"])
        metric_name = state.get("best_metric_name", "auc")
        metric_value = state.get("best_metric_value", state.get("best_val_auc", 0.0))
        logger.info(
            "Loaded best checkpoint from epoch %s (%s=%.4f)",
            state["epoch"],
            metric_name,
            metric_value,
        )

    test_labels, test_probs = evaluate_tta(
        model,
        test_ds,
        device,
        use_amp,
        tta_rounds=args.tta_rounds,
        input_size=args.input_size,
    )
    test_auc = macro_auc(test_labels, test_probs)
    test_preds = test_probs.argmax(axis=1)
    test_acc = float((test_preds == test_labels).mean())
    logger.info(
        "Test TTA×%s | macro_auc=%s acc=%.4f (best_val_%s epoch=%s)",
        args.tta_rounds,
        format_auc(test_auc),
        test_acc,
        best_metric_name or "auc",
        best_epoch,
    )

if __name__ == "__main__":
    main()
