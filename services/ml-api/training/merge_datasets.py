#!/usr/bin/env python3

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data/processed"


def load_sources() -> pd.DataFrame:
    frames = []
    zenodo_csv = PROCESSED / "zenodo_metadata.csv"
    nfld_csv = PROCESSED / "nfld_metadata.csv"
    if zenodo_csv.exists():
        frames.append(pd.read_csv(zenodo_csv))
    if nfld_csv.exists():
        frames.append(pd.read_csv(nfld_csv))
    if not frames:
        raise SystemExit(
            "No metadata CSVs. Run extract_zenodo_mat.py and prepare_mendeley_nfld.py."
        )
    return pd.concat(frames, ignore_index=True)


def split_patients(df: pd.DataFrame, seed: int = 42) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    patients = df[["patient_id", "class_id"]].drop_duplicates("patient_id")
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.3, random_state=seed)
    train_idx, temp_idx = next(
        splitter.split(patients, patients["class_id"], groups=patients["patient_id"])
    )
    train_patients = set(patients.iloc[train_idx]["patient_id"])
    temp_patients = patients.iloc[temp_idx]

    splitter2 = GroupShuffleSplit(n_splits=1, test_size=0.5, random_state=seed)
    val_idx, test_idx = next(
        splitter2.split(temp_patients, temp_patients["class_id"], groups=temp_patients["patient_id"])
    )
    val_patients = set(temp_patients.iloc[val_idx]["patient_id"])
    test_patients = set(temp_patients.iloc[test_idx]["patient_id"])

    train_df = df[df["patient_id"].isin(train_patients)].reset_index(drop=True)
    val_df = df[df["patient_id"].isin(val_patients)].reset_index(drop=True)
    test_df = df[df["patient_id"].isin(test_patients)].reset_index(drop=True)
    return train_df, val_df, test_df


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(PROCESSED))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    full = load_sources()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    train_df, val_df, test_df = split_patients(full, seed=args.seed)
    for name, part in [
        ("metadata_train", train_df),
        ("metadata_val", val_df),
        ("metadata_test", test_df),
    ]:
        path = out_dir / f"{name}.csv"
        part.to_csv(path, index=False)
        print(
            f"Wrote {path} ({len(part)} images, "
            f"{part['patient_id'].nunique()} patients, "
            f"pos={int((part['class_id'] == 1).sum())})"
        )

    full.to_csv(out_dir / "metadata.csv", index=False)
    print(f"Total: {len(full)} images, {full['patient_id'].nunique()} patients")


if __name__ == "__main__":
    main()
