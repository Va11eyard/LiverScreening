#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import date
from pathlib import Path

ML_API_ROOT = Path(__file__).resolve().parent.parent
PRODUCTION_DIR = ML_API_ROOT / "checkpoints" / "production"
CURRENT_PATH = PRODUCTION_DIR / "current.pt"
PREVIOUS_PATH = PRODUCTION_DIR / "previous.pt"
METADATA_PATH = PRODUCTION_DIR / "metadata.json"
ROLLBACK_META = PRODUCTION_DIR / "previous.metadata.json"

def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)

def rollback(force: bool) -> int:
    if not PREVIOUS_PATH.exists():
        print(f"No previous checkpoint at {PREVIOUS_PATH}", file=sys.stderr)
        return 1

    current_meta = load_json(METADATA_PATH)
    previous_meta = load_json(ROLLBACK_META)

    print("=== Rollback ===\n")
    print("CURRENT:")
    print(f"  version={current_meta.get('version', '?')}")
    print("ROLLBACK TARGET (previous.pt):")
    if previous_meta:
        print(f"  version={previous_meta.get('version', '?')}")
    else:
        print("  (metadata not saved — checkpoint only)")

    if not force:
        answer = input("\nRollback to previous production model? [yes/no]: ").strip().lower()
        if answer not in ("yes", "y"):
            print("Aborted.")
            return 0

    if METADATA_PATH.exists():
        shutil.copy2(METADATA_PATH, ROLLBACK_META)

    shutil.copy2(PREVIOUS_PATH, CURRENT_PATH)

    if previous_meta:
        restored = dict(previous_meta)
        restored["status"] = "production"
        restored["date"] = date.today().isoformat()
        with METADATA_PATH.open("w", encoding="utf-8") as fh:
            json.dump(restored, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    else:
        meta = load_json(METADATA_PATH)
        meta["status"] = "production"
        meta["date"] = date.today().isoformat()
        with METADATA_PATH.open("w", encoding="utf-8") as fh:
            json.dump(meta, fh, indent=2, ensure_ascii=False)
            fh.write("\n")

    print(f"\nRolled back -> {CURRENT_PATH}")
    print("Restart the ML API to load the restored production model.")
    return 0

def main() -> None:
    parser = argparse.ArgumentParser(description="Rollback production model to previous.pt")
    parser.add_argument("--force", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()
    raise SystemExit(rollback(args.force))

if __name__ == "__main__":
    main()
