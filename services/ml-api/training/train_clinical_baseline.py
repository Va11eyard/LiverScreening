#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
FEATURES = ["age", "bmi", "alt", "ast", "glucose", "ldl", "hdl", "triglycerides", "waist_cm"]


def _load_nfld(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    return df[df["source"] == "mendeley_nfld"].copy()


def train(train_csv: Path, val_csv: Path, out_path: Path) -> dict:
    train_df = _load_nfld(train_csv)
    val_df = _load_nfld(val_csv)
    if train_df.empty:
        raise SystemExit("No NFLD rows in train split for clinical baseline.")

    X_train = train_df[FEATURES]
    y_train = train_df["class_id"].astype(int)
    X_val = val_df[FEATURES] if not val_df.empty else X_train.iloc[:1]
    y_val = val_df["class_id"].astype(int) if not val_df.empty else y_train.iloc[:1]

    model = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            (
                "clf",
                LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42),
            ),
        ]
    )
    model.fit(X_train, y_train)
    val_probs = model.predict_proba(X_val)[:, 1]
    auc = float(roc_auc_score(y_val, val_probs)) if len(np.unique(y_val)) > 1 else 0.0

    out_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": FEATURES}, out_path)
    metrics = {"val_auc": auc, "train_n": int(len(train_df)), "val_n": int(len(val_df))}
    (out_path.parent / "clinical_baseline_metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )
    print(f"Saved clinical baseline: {out_path}")
    print(metrics)
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", default=str(ROOT / "data/processed/metadata_train.csv"))
    parser.add_argument("--val", default=str(ROOT / "data/processed/metadata_val.csv"))
    parser.add_argument("--out", default=str(ROOT / "models/clinical_baseline.joblib"))
    args = parser.parse_args()
    train(Path(args.train), Path(args.val), Path(args.out))


if __name__ == "__main__":
    main()
