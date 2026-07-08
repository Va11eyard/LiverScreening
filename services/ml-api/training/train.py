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
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import label_binarize
from torch.cuda.amp import GradScaler, autocast
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms

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
    required = {"path", "label", "patient_id"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing columns: {sorted(missing)}")

    patients = (
        df.groupby("patient_id", as_index=False)
        .agg(label=("label", lambda s: int(s.mode().iloc[0])))
        .assign(group_hash=lambda x: x["patient_id"].astype(str).map(patient_group_hash))
        .sort_values("group_hash")
        .reset_index(drop=True)
    )

    gss_train = GroupShuffleSplit(n_splits=1, test_size=0.30, random_state=seed)
    train_idx, temp_idx = next(
        gss_train.split(patients, patients["label"], groups=patients["patient_id"])
    )
    train_patients = set(patients.iloc[train_idx]["patient_id"])
    temp_patients = patients.iloc[temp_idx].reset_index(drop=True)

    gss_val = GroupShuffleSplit(n_splits=1, test_size=0.50, random_state=seed)
    val_idx, test_idx = next(
        gss_val.split(temp_patients, temp_patients["label"], groups=temp_patients["patient_id"])
    )
    val_patients = set(temp_patients.iloc[val_idx]["patient_id"])
    test_patients = set(temp_patients.iloc[test_idx]["patient_id"])

    if train_patients & val_patients or train_patients & test_patients or val_patients & test_patients:
        raise RuntimeError("Patient leakage detected between splits")

    train_df = df[df["patient_id"].isin(train_patients)].reset_index(drop=True)
    val_df = df[df["patient_id"].isin(val_patients)].reset_index(drop=True)
    test_df = df[df["patient_id"].isin(test_patients)].reset_index(drop=True)
    return train_df, val_df, test_df


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


def macro_auc(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    num_classes: int = NUM_CLASSES,
) -> float:
    if len(np.unique(y_true)) < 2:
        return 0.0
    y_bin = label_binarize(y_true, classes=list(range(num_classes)))
    if y_bin.shape[1] == 1:
        return float(roc_auc_score(y_true, y_prob[:, 1]))
    return float(roc_auc_score(y_bin, y_prob, multi_class="ovr", average="macro"))


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
    val_auc: float,
    phase: str,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "epoch": epoch,
            "phase": phase,
            "model_state": model.state_dict(),
            "best_val_auc": val_auc,
            "num_classes": NUM_CLASSES,
            "class_names": CLASS_NAMES,
            "model_name": "efficientnet_b4",
            "pretrained_source": "imagenet-1k",
        },
        path,
    )
    logger.info("Saved checkpoint %s (val_auc=%.4f)", path, val_auc)


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
    train_df, val_df, test_df = split_hash_groups(full_df, seed=args.seed)
    print_split_summary(train_df, val_df, test_df)

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
    best_epoch = -1
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
        scheduler.step()
        logger.info(
            "Warmup %s/%s | train_loss=%.4f val_loss=%.4f val_macro_auc=%.4f",
            epoch + 1,
            args.warmup_epochs,
            train_loss,
            val_loss,
            val_auc,
        )
        if val_auc > best_val_auc:
            best_val_auc = val_auc
            best_epoch = global_epoch
            patience_counter = 0
            save_checkpoint(ckpt_path, model, global_epoch, val_auc, phase="warmup")
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
        scheduler.step()
        logger.info(
            "Finetune %s/%s | train_loss=%.4f val_loss=%.4f val_macro_auc=%.4f",
            epoch + 1,
            finetune_epochs,
            train_loss,
            val_loss,
            val_auc,
        )
        if val_auc > best_val_auc:
            best_val_auc = val_auc
            best_epoch = global_epoch
            patience_counter = 0
            save_checkpoint(ckpt_path, model, global_epoch, val_auc, phase="finetune")
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                logger.info("Early stopping at epoch %s (patience=%s)", global_epoch, args.patience)
                break

    if ckpt_path.exists():
        state = torch.load(ckpt_path, map_location=device, weights_only=False)
        model.load_state_dict(state["model_state"])
        logger.info("Loaded best checkpoint from epoch %s (val_auc=%.4f)", state["epoch"], state["best_val_auc"])

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
        "Test TTA×%s | macro_auc=%.4f acc=%.4f (best_val_auc=%.4f epoch=%s)",
        args.tta_rounds,
        test_auc,
        test_acc,
        best_val_auc,
        best_epoch,
    )


if __name__ == "__main__":
    main()
