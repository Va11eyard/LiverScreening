from pathlib import Path

import pytest

from log_experiment import (
    SAFE_SPLIT_TYPE,
    add_experiment,
    compare_experiments,
    fetch_experiments,
    leakage_warnings,
)


@pytest.fixture
def temp_db(tmp_path: Path) -> Path:
    return tmp_path / "experiments.db"


def test_add_and_fetch(temp_db: Path):
    add_experiment("run-a", val_auc=0.83, test_auc=0.80, epochs=12, db_path=temp_db)
    add_experiment("run-b", val_auc=0.91, split_type="random-image", db_path=temp_db)
    rows = fetch_experiments(temp_db)
    assert len(rows) == 2
    assert rows[0]["name"] == "run-b"
    assert float(rows[0]["val_auc"]) == pytest.approx(0.91)


def test_leakage_warning(temp_db: Path):
    add_experiment("suspicious", val_auc=0.99, split_type="random-image", db_path=temp_db)
    rows = fetch_experiments(temp_db)
    warnings = leakage_warnings(rows)
    assert len(warnings) == 1
    assert "leakage" in warnings[0]


def test_no_warning_for_hash_patient(temp_db: Path):
    add_experiment("clean", val_auc=0.99, split_type=SAFE_SPLIT_TYPE, db_path=temp_db)
    rows = fetch_experiments(temp_db)
    assert leakage_warnings(rows) == []


def test_compare_experiments_empty(capsys, temp_db: Path):
    compare_experiments(temp_db)
    out = capsys.readouterr().out
    assert "No experiments" in out
