from __future__ import annotations

import argparse
import hashlib
import io
from pathlib import Path

import albumentations as A
import numpy as np
import pandas as pd
from albumentations.pytorch import ToTensorV2
from PIL import Image
from sklearn.model_selection import train_test_split
from torch.utils.data import Dataset

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_KAGGLE_ROOT = ROOT / "data/raw/kaggle_fibrosis"
PROCESSED_DIR = ROOT / "data/processed"
INPUT_SIZE = 300
NORMALIZE_JPEG_QUALITY = 90

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)

FIBROSIS_FOLDERS = ("F0", "F1", "F2", "F3", "F4")
CLASS_NAMES = {0: "Норма", 1: "Фиброз F1-F4"}


def fibrosis_folder_to_binary(folder: str) -> int:
    return 0 if folder.upper() == "F0" else 1


def find_kaggle_root(base: Path) -> Path:
    candidates = [
        base,
        base / "Dataset" / "Dataset",
        base / "Dataset",
    ]
    for candidate in candidates:
        if (candidate / "F0").is_dir():
            return candidate
    raise FileNotFoundError(f"Could not find F0-F4 folders under {base}")


def file_md5(path: str | Path) -> str:
    data = Path(path).read_bytes()
    return hashlib.md5(data).hexdigest()


def collect_kaggle_rows(kaggle_root: Path) -> pd.DataFrame:
    root = find_kaggle_root(kaggle_root)
    rows = []
    for folder in FIBROSIS_FOLDERS:
        class_dir = root / folder
        if not class_dir.is_dir():
            continue
        binary_label = fibrosis_folder_to_binary(folder)
        for path in sorted(class_dir.iterdir()):
            if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp"}:
                continue
            rows.append(
                {
                    "file_path": str(path.resolve()),
                    "md5": file_md5(path),
                    "class_id": binary_label,
                    "class_name": CLASS_NAMES[binary_label],
                    "fibrosis_stage": folder.upper(),
                    "source": "kaggle_fibrosis",
                }
            )
    if not rows:
        raise FileNotFoundError(f"No images found under {root}")
    return pd.DataFrame(rows)


def build_hash_groups(full: pd.DataFrame) -> pd.DataFrame:
    groups = (
        full.groupby("md5", as_index=False)
        .agg(
            class_id=("class_id", "first"),
            class_name=("class_name", "first"),
            fibrosis_stage=("fibrosis_stage", "first"),
            source=("source", "first"),
            file_path=("file_path", "first"),
            duplicate_count=("file_path", "count"),
        )
        .sort_values("md5")
        .reset_index(drop=True)
    )
    if (full.groupby("md5")["class_id"].nunique() > 1).any():
        bad = full.groupby("md5")["class_id"].nunique()
        bad = bad[bad > 1].index.tolist()[:5]
        raise ValueError(f"MD5 groups with conflicting labels: {bad}")
    return groups


def split_hash_groups(
    groups: pd.DataFrame,
    val_size: float = 0.1,
    seed: int = 42,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    train_groups, val_groups = train_test_split(
        groups,
        test_size=val_size,
        stratify=groups["class_id"],
        random_state=seed,
    )
    return train_groups.reset_index(drop=True), val_groups.reset_index(drop=True)


def expand_groups_to_rows(groups: pd.DataFrame, full: pd.DataFrame) -> pd.DataFrame:
    merged = full.merge(groups[["md5"]], on="md5", how="inner")
    return merged.reset_index(drop=True)


def build_hash_group_splits(
    kaggle_root: Path,
    val_size: float = 0.1,
    seed: int = 42,
    dedupe_to_one_path: bool = True,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    full = collect_kaggle_rows(kaggle_root)
    groups = build_hash_groups(full)
    train_groups, val_groups = split_hash_groups(groups, val_size=val_size, seed=seed)
    if dedupe_to_one_path:
        train_df = train_groups[
            ["file_path", "md5", "class_id", "class_name", "fibrosis_stage", "source", "duplicate_count"]
        ].copy()
        val_df = val_groups[
            ["file_path", "md5", "class_id", "class_name", "fibrosis_stage", "source", "duplicate_count"]
        ].copy()
    else:
        train_df = expand_groups_to_rows(train_groups, full)
        val_df = expand_groups_to_rows(val_groups, full)
    return train_df.reset_index(drop=True), val_df.reset_index(drop=True)


def build_kaggle_splits(
    kaggle_root: Path,
    val_size: float = 0.1,
    seed: int = 42,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    return build_hash_group_splits(
        kaggle_root,
        val_size=val_size,
        seed=seed,
        dedupe_to_one_path=True,
    )


def load_us_normalized_array(path: str | Path) -> np.ndarray:
    with Image.open(path) as img:
        rgb = img.convert("L").convert("RGB")
        rgb = rgb.resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        rgb.save(buf, format="JPEG", quality=NORMALIZE_JPEG_QUALITY, optimize=True)
        buf.seek(0)
        with Image.open(buf) as normalized:
            return np.array(normalized.convert("RGB"))


def load_us_rgb_array(path: str | Path) -> np.ndarray:
    return load_us_normalized_array(path)


def get_kaggle_train_transform() -> A.Compose:
    return A.Compose(
        [
            A.HorizontalFlip(p=0.5),
            A.RandomBrightnessContrast(
                brightness_limit=0.15,
                contrast_limit=0.15,
                p=0.5,
            ),
            A.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
            ToTensorV2(),
        ]
    )


def get_kaggle_val_transform() -> A.Compose:
    return A.Compose(
        [
            A.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
            ToTensorV2(),
        ]
    )


class KaggleFibrosisDataset(Dataset):
    def __init__(
        self,
        frame: pd.DataFrame | str | Path,
        transform: A.Compose | None = None,
    ):
        if isinstance(frame, (str, Path)):
            self.df = pd.read_csv(frame)
        else:
            self.df = frame.reset_index(drop=True)
        self.transform = transform or get_kaggle_val_transform()

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int):
        row = self.df.iloc[idx]
        image = load_us_normalized_array(row["file_path"])
        if self.transform is not None:
            image = self.transform(image=image)["image"]
        label = int(row["class_id"])
        return image, label


def write_split_csvs(
    kaggle_root: Path,
    out_dir: Path,
    val_size: float = 0.1,
    seed: int = 42,
) -> tuple[Path, Path]:
    train_df, val_df = build_hash_group_splits(
        kaggle_root,
        val_size=val_size,
        seed=seed,
        dedupe_to_one_path=True,
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    train_path = out_dir / "kaggle_metadata_train.csv"
    val_path = out_dir / "kaggle_metadata_val.csv"
    train_df.to_csv(train_path, index=False)
    val_df.to_csv(val_path, index=False)
    return train_path, val_path


def print_split_summary(train_df: pd.DataFrame, val_df: pd.DataFrame) -> None:
    overlap = len(set(train_df["md5"]) & set(val_df["md5"]))
    print(f"md5_overlap={overlap}")
    for name, df in [("train", train_df), ("val", val_df)]:
        pos = int((df["class_id"] == 1).sum())
        neg = int((df["class_id"] == 0).sum())
        print(f"{name}: n={len(df)} unique_md5={df['md5'].nunique()} neg(F0)={neg} pos(F1-F4)={pos}")
        print(df["fibrosis_stage"].value_counts().sort_index().to_string())
        print()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kaggle-root", default=str(DEFAULT_KAGGLE_ROOT))
    parser.add_argument("--out", default=str(PROCESSED_DIR))
    parser.add_argument("--val-size", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    kaggle_root = Path(args.kaggle_root)
    train_path, val_path = write_split_csvs(
        kaggle_root,
        Path(args.out),
        val_size=args.val_size,
        seed=args.seed,
    )
    train_df = pd.read_csv(train_path)
    val_df = pd.read_csv(val_path)
    print(f"Kaggle root: {find_kaggle_root(kaggle_root)}")
    print_split_summary(train_df, val_df)
    print(f"Wrote {train_path}")
    print(f"Wrote {val_path}")


if __name__ == "__main__":
    main()
