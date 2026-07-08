#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RAW = ROOT / "data/raw/NFLD_UltraSound_Image_&_Clinical_Dataset"
OUT_CSV = ROOT / "data/processed/nfld_metadata.csv"

FOLDER_TO_CLASS = {
    "normal": 0,
    "benign": 1,
    "malignant": 1,
}
CLASS_NAMES = {0: "Норма", 1: "Стеатоз / NAFLD"}
CLINICAL_COLS = [
    "age",
    "gender",
    "bmi",
    "waist_cm",
    "alt",
    "ast",
    "glucose",
    "cholesterol",
    "ldl",
    "hdl",
    "triglycerides",
    "liver_grade",
]


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename = {
        "ID": "patient_key",
        "Age": "age",
        "Gender(Female=1,Male=2)": "gender",
        "BMI": "bmi",
        "Waist_cm": "waist_cm",
        "ALT": "alt",
        "AST": "ast",
        "Glucose": "glucose",
        "Cholesterol": "cholesterol",
        "LDL": "ldl",
        "HDL": "hdl",
        "Triglycerides": "triglycerides",
        "Liver Grade( Normal=0, Benign=1, Malignant=2)": "liver_grade",
    }
    out = df.rename(columns=rename)
    out["patient_key"] = out["patient_key"].astype(str).str.strip().str.lower()
    return out


def prepare(raw_dir: Path, csv_path: Path) -> pd.DataFrame:
    xlsx_candidates = [p for p in raw_dir.glob("*.xlsx") if not p.name.startswith(".~lock")]
    if not xlsx_candidates:
        raise FileNotFoundError(f"No Clinical_data.xlsx under {raw_dir}")
    clinical = _normalize_columns(pd.read_excel(xlsx_candidates[0]))
    clinical = clinical.set_index("patient_key")

    images_root = raw_dir / "images"
    rows = []
    for folder_name, class_id in FOLDER_TO_CLASS.items():
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
            row = {
                "file_path": str(path.resolve()),
                "class_id": class_id,
                "class_name": CLASS_NAMES[class_id],
                "patient_id": f"nfld_{patient_key}",
                "source": "mendeley_nfld",
                "nfld_folder": folder_name,
            }
            if patient_key in clinical.index:
                clin = clinical.loc[patient_key]
                if isinstance(clin, pd.DataFrame):
                    clin = clin.iloc[0]
                for col in CLINICAL_COLS:
                    row[col] = clin.get(col, pd.NA)
            rows.append(row)

    if not rows:
        raise SystemExit(f"No NFLD images found under {images_root}")

    df = pd.DataFrame(rows)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(csv_path, index=False)
    print(
        f"NFLD: {len(df)} images from {df['patient_id'].nunique()} patients -> {csv_path}"
    )
    return df


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", default=str(DEFAULT_RAW))
    parser.add_argument("--csv", default=str(OUT_CSV))
    args = parser.parse_args()
    prepare(Path(args.raw), Path(args.csv))


if __name__ == "__main__":
    main()
