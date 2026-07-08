#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
import pandas as pd
import scipy.io
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MAT = ROOT / "data/raw/zenodo/dataset_liver_bmodes_steatosis_assessment_IJCARS.mat"
OUT_PNG = ROOT / "data/raw/zenodo/png"
OUT_CSV = ROOT / "data/processed/zenodo_metadata.csv"
CLASS_NAMES = {0: "Норма", 1: "Стеатоз / NAFLD"}

def extract(mat_path: Path, png_dir: Path, csv_path: Path) -> pd.DataFrame:
    mat = scipy.io.loadmat(str(mat_path), squeeze_me=True, struct_as_record=False)
    patients = mat["data"]
    png_dir.mkdir(parents=True, exist_ok=True)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for patient in patients:
        pid = int(patient.id)
        label = int(getattr(patient, "class"))
        fat_pct = float(patient.fat)
        images = np.asarray(patient.images)
        patient_dir = png_dir / f"patient_{pid:03d}"
        patient_dir.mkdir(parents=True, exist_ok=True)
        for frame_idx, frame in enumerate(images):
            out_path = patient_dir / f"frame_{frame_idx:02d}.png"
            Image.fromarray(frame.astype(np.uint8), mode="L").save(out_path)
            rows.append({
                "file_path": str(out_path.resolve()),
                "class_id": label,
                "class_name": CLASS_NAMES[label],
                "patient_id": f"zenodo_{pid:03d}",
                "source": "zenodo",
                "fat_pct": fat_pct,
                "frame_idx": frame_idx,
            })
    df = pd.DataFrame(rows)
    df.to_csv(csv_path, index=False)
    print(f"Zenodo: {len(df)} frames from {df['patient_id'].nunique()} patients -> {csv_path}")
    return df

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mat", default=str(DEFAULT_MAT))
    parser.add_argument("--png-dir", default=str(OUT_PNG))
    parser.add_argument("--csv", default=str(OUT_CSV))
    args = parser.parse_args()
    extract(Path(args.mat), Path(args.png_dir), Path(args.csv))

if __name__ == "__main__":
    main()
