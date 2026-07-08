#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from PIL import Image

from kaggle_fibrosis_dataset import (
    PROCESSED_DIR,
    build_hash_group_splits,
    find_kaggle_root,
    print_split_summary,
    write_split_csvs,
)

ROOT = Path(__file__).resolve().parent.parent
MIXED_SIGNATURE = "640x480_JPEG"


def native_signature(path: str) -> str:
    with Image.open(path) as img:
        return f"{img.size[0]}x{img.size[1]}_{img.format}"


def filter_mixed_jpeg(train_df: pd.DataFrame, val_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    train_df = train_df.copy()
    val_df = val_df.copy()
    train_df["sig"] = train_df["file_path"].map(native_signature)
    val_df["sig"] = val_df["file_path"].map(native_signature)
    train_m = train_df[train_df["sig"] == MIXED_SIGNATURE].drop(columns=["sig"])
    val_m = val_df[val_df["sig"] == MIXED_SIGNATURE].drop(columns=["sig"])
    return train_m.reset_index(drop=True), val_m.reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kaggle-root", default=str(ROOT / "data/raw/kaggle_fibrosis"))
    parser.add_argument("--out", default=str(PROCESSED_DIR))
    args = parser.parse_args()

    kaggle_root = Path(args.kaggle_root)
    train_df, val_df = build_hash_group_splits(kaggle_root, dedupe_to_one_path=True)
    train_m, val_m = filter_mixed_jpeg(train_df, val_df)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    train_path = out / "kaggle_metadata_train_mixed_jpeg.csv"
    val_path = out / "kaggle_metadata_val_mixed_jpeg.csv"
    train_m.to_csv(train_path, index=False)
    val_m.to_csv(val_path, index=False)

    print(f"Kaggle root: {find_kaggle_root(kaggle_root)}")
    print(f"subset={MIXED_SIGNATURE}")
    print_split_summary(train_m, val_m)
    print(f"Wrote {train_path}")
    print(f"Wrote {val_path}")


if __name__ == "__main__":
    main()
