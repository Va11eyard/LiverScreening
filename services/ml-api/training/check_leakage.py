#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

import pandas as pd

SPLITS = ("train", "val", "test")
REQUIRED_COLUMNS = {"path", "label", "patient_id", "split"}


def file_md5(path: str | Path) -> str:
    return hashlib.md5(Path(path).read_bytes()).hexdigest()


def load_and_validate(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise SystemExit(f"CSV missing columns: {sorted(missing)}")

    df = df.copy()
    df["split"] = df["split"].astype(str).str.strip().str.lower()
    bad_splits = sorted(set(df["split"]) - set(SPLITS))
    if bad_splits:
        raise SystemExit(f"Unknown split values: {bad_splits} (expected train/val/test)")

    if df["path"].duplicated().any():
        dup_paths = df.loc[df["path"].duplicated(keep=False), "path"].unique()[:5]
        raise SystemExit(f"Duplicate path entries in CSV, e.g. {dup_paths}")

    return df


def split_summary(df: pd.DataFrame, split_name: str) -> dict:
    part = df[df["split"] == split_name]
    label_counts = part["label"].value_counts().sort_index()
    return {
        "files": int(len(part)),
        "patients": int(part["patient_id"].nunique()),
        "labels": {int(k): int(v) for k, v in label_counts.items()},
    }


def check_md5_leakage(df: pd.DataFrame) -> list[str]:
    errors: list[str] = []
    md5_by_split: dict[str, pd.DataFrame] = {}

    for split_name in SPLITS:
        part = df[df["split"] == split_name]
        rows = []
        for _, row in part.iterrows():
            path = Path(row["path"])
            if not path.exists():
                errors.append(f"[{split_name}] missing file: {path}")
                continue
            rows.append(
                {
                    "path": str(path),
                    "md5": file_md5(path),
                    "patient_id": row["patient_id"],
                    "label": int(row["label"]),
                }
            )
        md5_by_split[split_name] = pd.DataFrame(rows)

    pairs = (("train", "val"), ("train", "test"), ("val", "test"))
    for left, right in pairs:
        if md5_by_split[left].empty or md5_by_split[right].empty:
            continue
        left_md5 = set(md5_by_split[left]["md5"])
        right_md5 = set(md5_by_split[right]["md5"])
        overlap = left_md5 & right_md5
        if not overlap:
            continue
        examples = []
        for md5 in sorted(overlap)[:5]:
            lrows = md5_by_split[left][md5_by_split[left]["md5"] == md5]
            rrows = md5_by_split[right][md5_by_split[right]["md5"] == md5]
            examples.append(
                f"md5={md5} | {left}={lrows.iloc[0]['path']} | {right}={rrows.iloc[0]['path']}"
            )
        errors.append(
            f"MD5 overlap {left}∩{right}: {len(overlap)} hash(es). Examples: " + "; ".join(examples)
        )

    return errors


def check_patient_leakage(df: pd.DataFrame) -> list[str]:
    errors: list[str] = []
    patients_by_split = {
        split_name: set(df.loc[df["split"] == split_name, "patient_id"].astype(str))
        for split_name in SPLITS
    }

    pairs = (("train", "val"), ("train", "test"), ("val", "test"))
    for left, right in pairs:
        overlap = patients_by_split[left] & patients_by_split[right]
        if not overlap:
            continue
        sample = ", ".join(sorted(list(overlap)[:10]))
        errors.append(f"patient_id overlap {left}∩{right}: {len(overlap)} patient(s), e.g. {sample}")

    return errors


def print_summaries(df: pd.DataFrame) -> None:
    print("Split summary")
    print("-" * 60)
    for split_name in SPLITS:
        summary = split_summary(df, split_name)
        labels = ", ".join(f"{k}:{v}" for k, v in summary["labels"].items())
        print(
            f"{split_name:5s} | files={summary['files']:5d} | "
            f"patients={summary['patients']:4d} | labels {{{labels}}}"
        )
    print("-" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(description="Check train/val/test leakage in split CSV")
    parser.add_argument("--csv", required=True, help="CSV with path,label,patient_id,split")
    args = parser.parse_args()

    df = load_and_validate(Path(args.csv))
    print_summaries(df)

    errors: list[str] = []
    errors.extend(check_patient_leakage(df))
    errors.extend(check_md5_leakage(df))

    if errors:
        print("\nLEAKAGE DETECTED", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        raise SystemExit(1)

    print("\nOK: no MD5 or patient_id leakage between train/val/test")


if __name__ == "__main__":
    main()
