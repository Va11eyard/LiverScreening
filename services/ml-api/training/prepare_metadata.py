#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import logging
import re
import sys
from pathlib import Path

import pandas as pd

TRAINING_ROOT = Path(__file__).resolve().parent
ML_API_ROOT = TRAINING_ROOT.parent
DEFAULT_DATA_DIR = ML_API_ROOT / "data/raw/behsof"
DEFAULT_DEMO_CSV = DEFAULT_DATA_DIR / "Demo_data.csv"
DEFAULT_OUT = TRAINING_ROOT / "metadata.csv"

CLASS_NAMES = ("normal", "steatosis", "fibrosis", "cirrhosis")
CAP_STEATOSIS = 238.0
LSM_FIBROSIS = 7.0
LSM_CIRRHOSIS = 12.5

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

def _numeric_suffix(path: Path) -> int:
    match = re.search(r"(\d+)$", path.stem)
    if not match:
        raise ValueError(f"Cannot parse numeric suffix from {path.name}")
    return int(match.group(1))

def map_patient_label(row: pd.Series) -> tuple[int, str]:
    fib_f = int(row.get("Fibroscan F", 0) or 0)
    steat = int(row.get("Steatosis stage", 0) or 0)
    cap = float(row["CAP score"]) if pd.notna(row.get("CAP score")) else 0.0
    lsm = float(row["E score"]) if pd.notna(row.get("E score")) else 0.0

    if fib_f >= 2 or lsm >= LSM_CIRRHOSIS:
        return 3, CLASS_NAMES[3]
    if fib_f >= 1 or lsm >= LSM_FIBROSIS:
        return 2, CLASS_NAMES[2]
    if steat >= 1 or cap >= CAP_STEATOSIS:
        return 1, CLASS_NAMES[1]
    return 0, CLASS_NAMES[0]

def load_demo(demo_csv: Path) -> pd.DataFrame:
    demo = pd.read_csv(demo_csv)
    demo["Patient ID"] = demo["Patient ID"].astype(str).str.strip()
    labels = demo.apply(map_patient_label, axis=1, result_type="expand")
    demo["label"] = labels[0].astype(int)
    demo["label_name"] = labels[1]
    return demo

def assign_image_blocks(images: list[Path], patients: list[str]) -> list[tuple[str, Path]]:
    if not patients:
        return []
    if not images:
        return []
    n_patients = len(patients)
    base, rem = divmod(len(images), n_patients)
    pairs: list[tuple[str, Path]] = []
    idx = 0
    for i, patient_id in enumerate(patients):
        count = base + (1 if i < rem else 0)
        for path in images[idx : idx + count]:
            pairs.append((patient_id, path))
        idx += count
    return pairs

def build_behsof_rows(data_dir: Path, demo_csv: Path) -> pd.DataFrame:
    demo = load_demo(demo_csv)
    behsof_root = data_dir / "BEHSOF"
    non_dir = behsof_root / "Non-NAFLD"
    naf_dir = behsof_root / "NAFLD"
    if not non_dir.exists() or not naf_dir.exists():
        raise FileNotFoundError(f"Expected Kaggle layout under {behsof_root}/NAFLD and Non-NAFLD")

    patients0 = demo.loc[demo["Steatosis stage"] == 0, "Patient ID"].sort_values().tolist()
    patients1 = demo.loc[demo["Steatosis stage"] > 0, "Patient ID"].sort_values().tolist()

    non_images = sorted(non_dir.glob("*.jpg"), key=_numeric_suffix)
    naf_images = sorted(naf_dir.glob("*.jpg"), key=_numeric_suffix)

    label_by_patient = demo.set_index("Patient ID")["label"].to_dict()
    rows: list[dict[str, object]] = []
    for patient_id, path in assign_image_blocks(non_images, patients0) + assign_image_blocks(
        naf_images, patients1
    ):
        rows.append(
            {
                "path": str(path.resolve()),
                "label": int(label_by_patient[patient_id]),
                "patient_id": f"behsof_{patient_id}",
            }
        )
    return pd.DataFrame(rows)

def load_nfld_rows(nfld_dir: Path) -> pd.DataFrame:
    xlsx_candidates = [p for p in nfld_dir.glob("*.xlsx") if not p.name.startswith(".~lock")]
    if not xlsx_candidates:
        raise FileNotFoundError(f"No clinical xlsx under {nfld_dir}")
    clinical = pd.read_excel(xlsx_candidates[0])
    clinical = clinical.rename(
        columns={
            "ID": "patient_key",
            "Liver Grade( Normal=0, Benign=1, Malignant=2)": "liver_grade",
        }
    )
    clinical["patient_key"] = clinical["patient_key"].astype(str).str.strip().str.lower()
    grade_to_label = {0: 0, 1: 1, 2: 2}
    folder_to_label = {"normal": 0, "benign": 1, "malignant": 2}

    images_root = nfld_dir / "images"
    rows: list[dict[str, object]] = []
    for folder_name, fallback_label in folder_to_label.items():
        folder = images_root / folder_name
        if not folder.exists():
            continue
        for path in folder.rglob("*"):
            if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp"}:
                continue
            match = re.match(r"(id\d+)", path.stem, flags=re.IGNORECASE)
            if not match:
                continue
            patient_key = match.group(1).lower()
            liver_grade = int(clinical.loc[clinical["patient_key"] == patient_key, "liver_grade"].iloc[0])
            label = grade_to_label.get(liver_grade, fallback_label)
            rows.append(
                {
                    "path": str(path.resolve()),
                    "label": label,
                    "patient_id": f"nfld_{patient_key}",
                }
            )
    if not rows:
        raise FileNotFoundError(f"No NFLD images found under {images_root}")
    return pd.DataFrame(rows)

def add_split_column(df: pd.DataFrame, seed: int) -> pd.DataFrame:
    from check_leakage import assign_splits

    return assign_splits(df, seed=seed)

def dedup_by_md5(df: pd.DataFrame) -> pd.DataFrame:
    seen: dict[str, int] = {}
    keep_rows: list[int] = []
    for i, row in df.iterrows():
        digest = hashlib.md5(Path(row["path"]).read_bytes()).hexdigest()
        if digest in seen:
            continue
        seen[digest] = i
        keep_rows.append(i)
    dropped = len(df) - len(keep_rows)
    if dropped:
        logger.warning("dropped %d duplicate MD5 images", dropped)
    return df.loc[keep_rows].reset_index(drop=True)

def print_stats(df: pd.DataFrame) -> None:
    logger.info("images=%d patients=%d", len(df), df["patient_id"].nunique())
    for idx, name in enumerate(CLASS_NAMES):
        part = df[df["label"] == idx]
        logger.info(
            "  %s (%d): images=%d patients=%d",
            name,
            idx,
            len(part),
            part["patient_id"].nunique(),
        )

def main() -> None:
    parser = argparse.ArgumentParser(description="Build metadata.csv for BEHSOF training")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--demo-csv", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--merge-nfld", type=Path, default=None, help="Path to Mendeley NFLD raw dir")
    parser.add_argument("--write-split", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    demo_csv = args.demo_csv or (args.data_dir / "Demo_data.csv")
    if not demo_csv.exists():
        raise SystemExit(
            f"Missing {demo_csv}. Download Figshare Demo_data.csv into {args.data_dir}"
        )

    df = build_behsof_rows(args.data_dir, demo_csv)
    behsof_df = df.copy()
    print_stats(behsof_df)
    logger.info("--- BEHSOF only ---")

    if args.merge_nfld:
        nfld_df = load_nfld_rows(args.merge_nfld)
        df = pd.concat([behsof_df, nfld_df], ignore_index=True)
        logger.info("--- After merge with NFLD ---")
        print_stats(df)
        logger.info(
            "merged NFLD: images=%d patients=%d",
            len(nfld_df),
            nfld_df["patient_id"].nunique(),
        )

    missing_paths = df[~df["path"].map(lambda p: Path(p).exists())]
    if not missing_paths.empty:
        logger.warning("dropping %d rows with missing files", len(missing_paths))
        df = df[df["path"].map(lambda p: Path(p).exists())].reset_index(drop=True)

    df = dedup_by_md5(df)

    if args.write_split:
        df = add_split_column(df, seed=args.seed)

    if not args.merge_nfld:
        print_stats(df)

    patients = df["patient_id"].nunique()
    if patients < 150:
        logger.warning(
            "Only %d patients — honest 70/15/15 split yields ~%d val / ~%d test patients. "
            "Consider --merge-nfld after reviewing BEHSOF-only stats.",
            patients,
            max(1, int(patients * 0.15)),
            max(1, int(patients * 0.15)),
        )

    if args.dry_run:
        logger.info("dry-run: not writing %s", args.out)
        return

    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)
    logger.info("wrote %s (%d rows)", args.out, len(df))

if __name__ == "__main__":
    main()
