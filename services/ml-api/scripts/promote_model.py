#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import date
from pathlib import Path

import torch

ML_API_ROOT = Path(__file__).resolve().parent.parent
PRODUCTION_DIR = ML_API_ROOT / "checkpoints" / "production"
CURRENT_PATH = PRODUCTION_DIR / "current.pt"
PREVIOUS_PATH = PRODUCTION_DIR / "previous.pt"
METADATA_PATH = PRODUCTION_DIR / "metadata.json"

def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)

def metadata_from_checkpoint(path: Path) -> dict:
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    return {
        "version": path.stem,
        "val_auc": ckpt.get("best_val_auc") or ckpt.get("best_metric_value"),
        "classes": ckpt.get("num_classes"),
        "class_names": list(ckpt.get("class_names") or []),
        "model_name": ckpt.get("model_name", "efficientnet_b4"),
        "input_size": 380,
        "status": "candidate",
    }

def resolve_candidate_metadata(candidate_path: Path) -> dict:
    sidecar = candidate_path.with_suffix(".metadata.json")
    if sidecar.exists():
        meta = load_json(sidecar)
        meta.setdefault("version", candidate_path.stem)
        return meta
    return metadata_from_checkpoint(candidate_path)

def fmt_meta(meta: dict) -> str:
    version = meta.get("version", "?")
    val_auc = meta.get("val_auc")
    test_auc = meta.get("test_auc")
    classes = meta.get("classes", "?")
    names = ", ".join(meta.get("class_names") or [])
    val_s = f"{float(val_auc):.4f}" if val_auc is not None else "n/a"
    test_s = f"{float(test_auc):.4f}" if test_auc is not None else "n/a"
    return (
        f"  version={version}\n"
        f"  val_auc={val_s}  test_auc={test_s}\n"
        f"  classes={classes}  [{names}]"
    )

def promote(candidate_path: Path, force: bool) -> int:
    if not candidate_path.exists():
        print(f"Candidate not found: {candidate_path}", file=sys.stderr)
        return 1

    candidate_meta = resolve_candidate_metadata(candidate_path)
    current_meta = load_json(METADATA_PATH)

    print("=== Model promotion comparison ===\n")
    print("CURRENT PRODUCTION:")
    print(fmt_meta(current_meta) if current_meta else "  (none)")
    print("\nCANDIDATE:")
    print(fmt_meta(candidate_meta))
    print(f"\nCandidate file: {candidate_path}")

    if not force:
        answer = input("\nPromote candidate to production? [yes/no]: ").strip().lower()
        if answer not in ("yes", "y"):
            print("Aborted.")
            return 0

    PRODUCTION_DIR.mkdir(parents=True, exist_ok=True)
    if CURRENT_PATH.exists():
        shutil.copy2(CURRENT_PATH, PREVIOUS_PATH)
        if METADATA_PATH.exists():
            shutil.copy2(METADATA_PATH, PRODUCTION_DIR / "previous.metadata.json")
        print(f"Saved previous production -> {PREVIOUS_PATH}")

    shutil.copy2(candidate_path, CURRENT_PATH)

    new_meta = dict(candidate_meta)
    new_meta["status"] = "production"
    new_meta["date"] = date.today().isoformat()
    new_meta.setdefault("version", candidate_path.stem)
    if new_meta.get("classes") is None:
        new_meta["classes"] = len(new_meta.get("class_names") or [])

    with METADATA_PATH.open("w", encoding="utf-8") as fh:
        json.dump(new_meta, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    print(f"\nPromoted -> {CURRENT_PATH}")
    print(f"Updated metadata -> {METADATA_PATH}")
    print("Restart the ML API to load the new production model.")
    return 0

def main() -> None:
    parser = argparse.ArgumentParser(description="Promote candidate checkpoint to production")
    parser.add_argument(
        "--candidate",
        required=True,
        help="Path to candidate .pt (e.g. checkpoints/candidates/effb4_binary_v1.pt)",
    )
    parser.add_argument("--force", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    candidate = Path(args.candidate)
    if not candidate.is_absolute():
        candidate = ML_API_ROOT / candidate

    raise SystemExit(promote(candidate, args.force))

if __name__ == "__main__":
    main()
