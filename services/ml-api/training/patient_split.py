from __future__ import annotations

import numpy as np
import pandas as pd

NUM_CLASSES = 4
CLASS_NAMES = ("normal", "steatosis", "fibrosis", "cirrhosis")
MIN_PATIENTS_PER_CLASS = 3

class StratifiedSplitError(ValueError):
    pass

def patient_label_table(df: pd.DataFrame) -> pd.DataFrame:
    required = {"path", "label", "patient_id"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing columns: {sorted(missing)}")
    return (
        df.groupby("patient_id", as_index=False)
        .agg(label=("label", lambda s: int(s.mode().iloc[0])))
        .sort_values("patient_id")
        .reset_index(drop=True)
    )

def stratified_patient_split(
    df: pd.DataFrame,
    seed: int = 42,
    val_frac: float = 0.15,
    test_frac: float = 0.15,
    num_classes: int = NUM_CLASSES,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    patients = patient_label_table(df)
    rng = np.random.RandomState(seed)

    train_ids: set[str] = set()
    val_ids: set[str] = set()
    test_ids: set[str] = set()
    insufficient: list[tuple[int, int]] = []

    for class_id in range(num_classes):
        class_patients = patients.loc[patients["label"] == class_id, "patient_id"].astype(str).tolist()
        n = len(class_patients)
        if n < MIN_PATIENTS_PER_CLASS:
            insufficient.append((class_id, n))
            continue

        order = np.array(class_patients, dtype=object)
        rng.shuffle(order)

        n_test = max(1, int(round(n * test_frac)))
        n_val = max(1, int(round(n * val_frac)))
        if n_test + n_val > n - 1:
            n_test = max(1, min(n_test, n - 2))
            n_val = max(1, min(n_val, n - n_test - 1))
        n_train = n - n_val - n_test
        if n_train < 1:
            raise StratifiedSplitError(
                f"Class {class_id} ({CLASS_NAMES[class_id]}): cannot allocate >=1 patient to "
                f"train/val/test (n={n}). Merge more data with --merge-nfld."
            )

        test_ids.update(order[:n_test].tolist())
        val_ids.update(order[n_test : n_test + n_val].tolist())
        train_ids.update(order[n_test + n_val :].tolist())

    if insufficient:
        details = ", ".join(
            f"{CLASS_NAMES[c]} ({c}): {n} patients (need >={MIN_PATIENTS_PER_CLASS})"
            for c, n in insufficient
        )
        raise StratifiedSplitError(
            f"Cannot build stratified train/val/test with all {num_classes} classes. "
            f"Insufficient patients: {details}. Use --merge-nfld or add more data."
        )

    overlap = (train_ids & val_ids) | (train_ids & test_ids) | (val_ids & test_ids)
    if overlap:
        raise StratifiedSplitError(f"Internal split error: patient overlap {sorted(overlap)[:5]}")

    for split_name, ids in [("train", train_ids), ("val", val_ids), ("test", test_ids)]:
        present = set(patients.loc[patients["patient_id"].astype(str).isin(ids), "label"].astype(int))
        missing = set(range(num_classes)) - present
        if missing:
            names = [CLASS_NAMES[i] for i in sorted(missing)]
            raise StratifiedSplitError(
                f"Split '{split_name}' missing patient-level classes: {names}. "
                f"Dataset too small for stratified split — merge additional data."
            )

    train_df = df[df["patient_id"].astype(str).isin(train_ids)].reset_index(drop=True)
    val_df = df[df["patient_id"].astype(str).isin(val_ids)].reset_index(drop=True)
    test_df = df[df["patient_id"].astype(str).isin(test_ids)].reset_index(drop=True)
    return train_df, val_df, test_df

def split_class_coverage(df: pd.DataFrame, num_classes: int = NUM_CLASSES) -> dict[str, set[int]]:
    if "split" not in df.columns:
        raise ValueError("DataFrame has no split column")
    coverage: dict[str, set[int]] = {}
    for split_name in ("train", "val", "test"):
        part = df[df["split"] == split_name]
        coverage[split_name] = set(part["label"].astype(int).unique())
    return coverage

def assert_split_class_coverage(
    df: pd.DataFrame,
    num_classes: int = NUM_CLASSES,
    level: str = "patient",
) -> None:
    errors: list[str] = []
    for split_name in ("train", "val", "test"):
        part = df[df["split"] == split_name]
        if level == "patient":
            labels = set(
                part.groupby("patient_id")["label"]
                .agg(lambda s: int(s.mode().iloc[0]))
                .astype(int)
                .unique()
            )
        else:
            labels = set(part["label"].astype(int).unique())
        missing = set(range(num_classes)) - labels
        if missing:
            names = [CLASS_NAMES[i] for i in sorted(missing)]
            errors.append(f"{split_name} missing {level}-level classes: {names}")
    if errors:
        raise StratifiedSplitError("; ".join(errors))
