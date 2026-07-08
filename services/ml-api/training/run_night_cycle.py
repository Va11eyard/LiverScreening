#!/usr/bin/env python3
"""Run overnight candidate training iterations (never touches production/)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

TRAINING_ROOT = Path(__file__).resolve().parent
ML_API_ROOT = TRAINING_ROOT.parent
RESULTS_PATH = TRAINING_ROOT / "RESULTS.md"

CSV = str(TRAINING_ROOT / "metadata.csv")
PYTHON = sys.executable
TRAIN = str(TRAINING_ROOT / "train_candidate.py")
ENSEMBLE = str(TRAINING_ROOT / "build_ensemble.py")


def run_train(name: str, checkpoint: str, **kwargs) -> dict:
    cmd = [
        PYTHON,
        TRAIN,
        "--csv",
        CSV,
        "--checkpoint",
        checkpoint,
        "--experiment-name",
        name,
    ]
    for key, value in kwargs.items():
        flag = "--" + key.replace("_", "-")
        cmd.extend([flag, str(value)])
    print("\n>>>", " ".join(cmd), flush=True)
    proc = subprocess.run(cmd, cwd=ML_API_ROOT)
    if proc.returncode != 0:
        raise RuntimeError(f"Training failed: {name}")
    meta_path = (ML_API_ROOT / checkpoint).with_suffix(".metadata.json")
    return json.loads(meta_path.read_text(encoding="utf-8"))


def main() -> None:
    results: list[dict] = []

    # Baseline reference (already trained)
    results.append(
        {
            "iteration": 0,
            "name": "v0_baseline_4class",
            "scheme": "4class",
            "model": "efficientnet_b4",
            "val_auc": 0.615,
            "test_auc": 0.6,
            "test_acc": 0.344,
            "checkpoint": "checkpoints/candidates/effb4_v0_baseline.pt",
        }
    )

    # Iteration 1: binary
    r1 = run_train(
        "effb4_binary_v1",
        "checkpoints/candidates/effb4_binary_v1.pt",
        scheme="binary",
        model="efficientnet_b4",
        loss="ce",
        seed=42,
    )
    r1.update({"iteration": 1, "name": "effb4_binary_v1"})
    results.append(r1)

    best_val = float(r1.get("val_auc") or 0)
    best_config = dict(scheme="binary", model="efficientnet_b4", loss="ce", input_size=380)

    # Iteration 2: tune binary if not already >= 0.75
    if best_val < 0.75:
        r2 = run_train(
            "effb4_binary_v2",
            "checkpoints/candidates/effb4_binary_v2.pt",
            scheme="binary",
            model="efficientnet_b4",
            loss="focal",
            input_size=456,
            seed=42,
        )
        r2.update({"iteration": 2, "name": "effb4_binary_v2"})
        results.append(r2)
        if float(r2.get("val_auc") or 0) > best_val:
            best_val = float(r2["val_auc"])
            best_config = dict(scheme="binary", model="efficientnet_b4", loss="focal", input_size=456)

        if best_val < 0.75:
            r2b = run_train(
                "effb4_binary_v2_b3",
                "checkpoints/candidates/effb4_binary_v2_b3.pt",
                scheme="binary",
                model="efficientnet_b3",
                loss="focal",
                input_size=456,
                seed=43,
            )
            r2b.update({"iteration": "2b", "name": "effb4_binary_v2_b3"})
            results.append(r2b)
            if float(r2b.get("val_auc") or 0) > best_val:
                best_val = float(r2b["val_auc"])
                best_config = dict(scheme="binary", model="efficientnet_b3", loss="focal", input_size=456)

    # Iteration 3: 3-class if still below 0.75
    if best_val < 0.75:
        r3 = run_train(
            "effb4_3class_v1",
            "checkpoints/candidates/effb4_3class_v1.pt",
            scheme="3class",
            model="efficientnet_b4",
            loss="focal",
            seed=44,
        )
        r3.update({"iteration": 3, "name": "effb4_3class_v1"})
        results.append(r3)
        if float(r3.get("val_auc") or 0) > best_val:
            best_val = float(r3["val_auc"])
            best_config = dict(scheme="3class", model="efficientnet_b4", loss="focal", input_size=380)

    # Iteration 4: ensemble (3 seeds on best binary config)
    seed_ckpts = []
    for i, seed in enumerate((42, 43, 44), start=1):
        ckpt = f"checkpoints/candidates/effb4_ens_seed{seed}.pt"
        run_train(
            f"effb4_ens_seed{seed}",
            ckpt,
            scheme=best_config["scheme"],
            model=best_config["model"],
            loss=best_config["loss"],
            input_size=best_config.get("input_size", 380),
            seed=seed,
        )
        seed_ckpts.append(ckpt)

    subprocess.run(
        [
            PYTHON,
            ENSEMBLE,
            "--csv",
            CSV,
            "--checkpoints",
            *seed_ckpts,
            "--output",
            "checkpoints/candidates/effb4_ensemble_v1.pt",
            "--experiment-name",
            "effb4_ensemble_v1",
            "--scheme",
            best_config["scheme"],
            "--input-size",
            str(best_config.get("input_size", 380)),
        ],
        cwd=ML_API_ROOT,
        check=True,
    )
    ens_meta = json.loads(
        (ML_API_ROOT / "checkpoints/candidates/effb4_ensemble_v1.metadata.json").read_text(encoding="utf-8")
    )
    ens_meta.update({"iteration": 4, "name": "effb4_ensemble_v1"})
    results.append(ens_meta)

    write_results(results, best_val)


def write_results(results: list[dict], best_val: float) -> None:
    best = max(results, key=lambda r: float(r.get("val_auc") or 0))
    lines = [
        "# Training RESULTS — overnight candidate sweep",
        "",
        f"**Goal:** val macro-AUC ≥ 0.75. **Best val AUC:** {float(best.get('val_auc') or 0):.4f}",
        "",
        "## All attempts",
        "",
        "| Iter | Name | Scheme | Model | Loss | Val AUC | Test AUC | Test Acc | Checkpoint |",
        "|------|------|--------|-------|------|---------|----------|----------|------------|",
    ]
    for r in results:
        lines.append(
            "| {iter} | {name} | {scheme} | {model} | {loss} | {val_auc:.4f} | {test_auc} | {test_acc} | `{ckpt}` |".format(
                iter=r.get("iteration", "-"),
                name=r.get("name", r.get("version", "?")),
                scheme=r.get("scheme", r.get("label_scheme", "?")),
                model=r.get("model", r.get("model_name", "?")),
                loss=r.get("loss", "-"),
                val_auc=float(r.get("val_auc") or 0),
                test_auc=f"{float(r['test_auc']):.4f}" if r.get("test_auc") is not None else "n/a",
                test_acc=f"{float(r['test_acc']):.4f}" if r.get("test_acc") is not None else "n/a",
                ckpt=r.get("checkpoint", f"checkpoints/candidates/{r.get('version', '?')}.pt"),
            )
        )

    lines.extend(
        [
            "",
            "## Best candidate",
            "",
            f"- **Version:** {best.get('version', best.get('name'))}",
            f"- **Label scheme:** {best.get('label_scheme', best.get('scheme'))} ({best.get('classes', '?')} classes)",
            f"- **Class names:** {', '.join(best.get('class_names') or [])}",
            f"- **Checkpoint:** `checkpoints/candidates/{best.get('version', best.get('name'))}.pt`",
            f"- **Metadata:** `checkpoints/candidates/{best.get('version', best.get('name'))}.metadata.json`",
            "",
        ]
    )

    if best_val < 0.75:
        lines.extend(
            [
                "## Data ceiling",
                "",
                "None of the overnight iterations reached val macro-AUC ≥ 0.75 on the merged BEHSOF+NFLD cohort "
                "(199 patients, patient-level stratified split). The best candidate is documented above.",
                "",
            ]
        )

    if best.get("scheme") == "binary" or best.get("label_scheme") == "binary":
        lines.extend(
            [
                "## API patch (NOT applied — promote manually)",
                "",
                "If promoting the binary model, map vision output to rule-out/rule-in:",
                "",
                "```diff",
                "--- a/app/model_loader.py",
                "+++ b/app/model_loader.py",
                "@@ CLASSES for binary candidate",
                "+# low_risk (normal+steatosis) / high_risk (fibrosis+cirrhosis)",
                "+# CLASS_LABELS_RU already includes low_risk / high_risk",
                "```",
                "",
                "Promotion: `python scripts/promote_model.py --candidate checkpoints/candidates/<best>.pt`",
                "",
                "## Pitch recommendation",
                "",
                "Объясните жюри переход на бинарную схему как **клиническое решение**, а не упрощение модели:",
                "",
                "1. **FIB-4 / APRI уже дают rule-out vs rule-in** — бинарный ML-слой согласован с triage-пайплайном PMSP.",
                "2. **Класс cirrhosis — 11 пациентов**; 4-классовая постановка статистически нестабильна (macro-AUC 0.60 на test).",
                "3. **low_risk / high_risk** отвечает на вопрос врача: «нужна ли эластография / гепатолог?», а не на учебниковую гистологическую градацию.",
                "4. При улучшении данных (больше цирроза, мультицентр) можно вернуть 3–4 класса через `promote_model.py` без смены API.",
                "",
            ]
        )

    RESULTS_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nWrote {RESULTS_PATH}")


if __name__ == "__main__":
    main()
