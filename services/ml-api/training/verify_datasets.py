#!/usr/bin/env python3

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZENODO_MAT = ROOT / "data/raw/zenodo/dataset_liver_bmodes_steatosis_assessment_IJCARS.mat"
NFLD_DIR = ROOT / "data/raw/NFLD_UltraSound_Image_&_Clinical_Dataset"


def main() -> None:
    ok = True
    if not ZENODO_MAT.exists():
        print(f"MISSING: {ZENODO_MAT}")
        ok = False
    else:
        print(f"OK Zenodo: {ZENODO_MAT.name}")

    if not NFLD_DIR.exists():
        print(f"MISSING: {NFLD_DIR}")
        ok = False
    else:
        xlsx = [p for p in NFLD_DIR.glob("*.xlsx") if not p.name.startswith(".~lock")]
        images = NFLD_DIR / "images"
        if not xlsx:
            print(f"MISSING: Clinical_data.xlsx in {NFLD_DIR}")
            ok = False
        elif not images.exists():
            print(f"MISSING: images/ in {NFLD_DIR}")
            ok = False
        else:
            print(f"OK NFLD: {xlsx[0].name} + images/")

    if not ok:
        sys.exit(1)
    print("Datasets ready for extract + merge.")


if __name__ == "__main__":
    main()
