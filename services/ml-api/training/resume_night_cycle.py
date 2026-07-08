#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

TRAINING_ROOT = Path(__file__).resolve().parent
ML_API_ROOT = TRAINING_ROOT.parent
PYTHON = sys.executable
TRAIN = str(TRAINING_ROOT / "train_candidate.py")
ENSEMBLE = str(TRAINING_ROOT / "build_ensemble.py")
CSV = str(TRAINING_ROOT / "metadata.csv")


def run(cmd: list[str]) -> bool:
    print("\n>>>", " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=ML_API_ROOT).returncode == 0


def load_meta(ckpt: str) -> dict:
    path = (ML_API_ROOT / ckpt).with_suffix(".metadata.json")
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def main() -> None:
    results = [
        {
            "iteration": 0,
            "name": "v0_baseline_4class",
            "scheme": "4class",
            "model": "efficientnet_b4",
            "loss": "ce",
            "val_auc": 0.615,
            "test_auc": 0.6,
            "test_acc": 0.344,
            "checkpoint": "checkpoints/candidates/effb4_v0_baseline.pt",
        },
        {**load_meta("checkpoints/candidates/effb4_binary_v1.pt"), "iteration": 1, "name": "effb4_binary_v1"},
    ]

    if not (ML_API_ROOT / "checkpoints/candidates/effb4_binary_v2.pt").exists():
        run(
            [
                PYTHON,
                TRAIN,
                "--csv",
                CSV,
                "--checkpoint",
                "checkpoints/candidates/effb4_binary_v2.pt",
                "--experiment-name",
                "effb4_binary_v2",
                "--scheme",
                "binary",
                "--model",
                "efficientnet_b4",
                "--loss",
                "focal",
                "--input-size",
                "456",
                "--seed",
                "42",
            ]
        )
    if (ML_API_ROOT / "checkpoints/candidates/effb4_binary_v2.pt").exists():
        results.append({**load_meta("checkpoints/candidates/effb4_binary_v2.pt"), "iteration": 2, "name": "effb4_binary_v2"})

    if not (ML_API_ROOT / "checkpoints/candidates/effb4_3class_v1.pt").exists():
        run(
            [
                PYTHON,
                TRAIN,
                "--csv",
                CSV,
                "--checkpoint",
                "checkpoints/candidates/effb4_3class_v1.pt",
                "--experiment-name",
                "effb4_3class_v1",
                "--scheme",
                "3class",
                "--model",
                "efficientnet_b4",
                "--loss",
                "focal",
                "--seed",
                "44",
            ]
        )
    if (ML_API_ROOT / "checkpoints/candidates/effb4_3class_v1.pt").exists():
        results.append({**load_meta("checkpoints/candidates/effb4_3class_v1.pt"), "iteration": 3, "name": "effb4_3class_v1"})

    for seed in (43, 44):
        ckpt = f"checkpoints/candidates/effb4_ens_seed{seed}.pt"
        if not (ML_API_ROOT / ckpt).exists():
            run(
                [
                    PYTHON,
                    TRAIN,
                    "--csv",
                    CSV,
                    "--checkpoint",
                    ckpt,
                    "--experiment-name",
                    f"effb4_ens_seed{seed}",
                    "--scheme",
                    "binary",
                    "--model",
                    "efficientnet_b4",
                    "--loss",
                    "focal",
                    "--input-size",
                    "456",
                    "--seed",
                    str(seed),
                ]
            )

    members = [
        "checkpoints/candidates/effb4_binary_v1.pt",
        "checkpoints/candidates/effb4_ens_seed42.pt",
        "checkpoints/candidates/effb4_ens_seed43.pt",
    ]
    members = [m for m in members if (ML_API_ROOT / m).exists()]
    if len(members) >= 2:
        run(
            [
                PYTHON,
                ENSEMBLE,
                "--csv",
                CSV,
                "--checkpoints",
                *members,
                "--output",
                "checkpoints/candidates/effb4_ensemble_v1.pt",
                "--experiment-name",
                "effb4_ensemble_v1",
                "--scheme",
                "binary",
                "--input-size",
                "380",
            ]
        )
        if (ML_API_ROOT / "checkpoints/candidates/effb4_ensemble_v1.metadata.json").exists():
            results.append({**load_meta("checkpoints/candidates/effb4_ensemble_v1.pt"), "iteration": 4, "name": "effb4_ensemble_v1"})

    from run_night_cycle import write_results

    best_val = max(float(r.get("val_auc") or 0) for r in results)
    write_results(results, best_val)


if __name__ == "__main__":
    main()
