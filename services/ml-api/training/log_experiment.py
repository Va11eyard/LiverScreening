#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

TRAINING_ROOT = Path(__file__).resolve().parent
DEFAULT_DB = TRAINING_ROOT / "experiments.db"

LEAKAGE_VAL_AUC_THRESHOLD = 0.97
SAFE_SPLIT_TYPE = "hash-patient"

COLUMNS = (
    "id",
    "name",
    "model",
    "pretrain",
    "split_type",
    "val_auc",
    "test_auc",
    "epochs",
    "notes",
    "created_at",
)


def get_connection(db_path: Path = DEFAULT_DB) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path = DEFAULT_DB) -> None:
    with get_connection(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS experiments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                model TEXT NOT NULL,
                pretrain TEXT NOT NULL,
                split_type TEXT NOT NULL,
                val_auc REAL NOT NULL,
                test_auc REAL,
                epochs INTEGER,
                notes TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def add_experiment(
    name: str,
    val_auc: float,
    model: str = "efficientnet_b4",
    pretrain: str = "imagenet-1k",
    split_type: str = SAFE_SPLIT_TYPE,
    test_auc: float | None = None,
    epochs: int | None = None,
    notes: str = "",
    db_path: Path = DEFAULT_DB,
) -> int:
    init_db(db_path)
    created_at = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO experiments (
                name, model, pretrain, split_type, val_auc, test_auc, epochs, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                model,
                pretrain,
                split_type,
                val_auc,
                test_auc,
                epochs,
                notes or "",
                created_at,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)


def fetch_experiments(db_path: Path = DEFAULT_DB) -> list[sqlite3.Row]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT id, name, model, pretrain, split_type, val_auc, test_auc, epochs, notes, created_at
            FROM experiments
            ORDER BY val_auc DESC, id DESC
            """
        ).fetchall()
    return list(rows)


def leakage_warnings(rows: list[sqlite3.Row]) -> list[str]:
    warnings: list[str] = []
    for row in rows:
        val_auc = float(row["val_auc"])
        split_type = str(row["split_type"])
        if val_auc > LEAKAGE_VAL_AUC_THRESHOLD and split_type != SAFE_SPLIT_TYPE:
            warnings.append(
                f"⚠ id={row['id']} name={row['name']}: val_auc={val_auc:.4f} > {LEAKAGE_VAL_AUC_THRESHOLD} "
                f"при split_type='{split_type}' (ожидается '{SAFE_SPLIT_TYPE}') — вероятный leakage"
            )
    return warnings


def _fmt_float(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{float(value):.4f}"


def compare_experiments(db_path: Path = DEFAULT_DB) -> None:
    rows = fetch_experiments(db_path)
    if not rows:
        print("No experiments logged yet.")
        return

    headers = ["id", "name", "model", "pretrain", "split", "val_auc", "test_auc", "epochs", "created_at"]
    table_rows: list[list[str]] = []
    for row in rows:
        table_rows.append(
            [
                str(row["id"]),
                str(row["name"])[:24],
                str(row["model"])[:18],
                str(row["pretrain"])[:14],
                str(row["split_type"])[:14],
                _fmt_float(row["val_auc"]),
                _fmt_float(row["test_auc"]),
                "-" if row["epochs"] is None else str(row["epochs"]),
                str(row["created_at"])[:19],
            ]
        )

    widths = [len(h) for h in headers]
    for tr in table_rows:
        widths = [max(w, len(cell)) for w, cell in zip(widths, tr)]

    def print_row(cells: list[str]) -> None:
        print(" | ".join(cell.ljust(widths[i]) for i, cell in enumerate(cells)))

    print_row(headers)
    print("-+-".join("-" * w for w in widths))
    for tr in table_rows:
        print_row(tr)

    for row in rows:
        if row["notes"]:
            print(f"\n[{row['id']}] {row['name']}: {row['notes']}")

    warnings = leakage_warnings(rows)
    if warnings:
        print("\nLEAKAGE WARNINGS")
        for warning in warnings:
            print(warning)


def cmd_add(args: argparse.Namespace) -> None:
    exp_id = add_experiment(
        name=args.name,
        val_auc=args.val_auc,
        model=args.model,
        pretrain=args.pretrain,
        split_type=args.split_type,
        test_auc=args.test_auc,
        epochs=args.epochs,
        notes=args.notes or "",
        db_path=Path(args.db),
    )
    print(f"Logged experiment id={exp_id} -> {args.db}")
    if args.val_auc > LEAKAGE_VAL_AUC_THRESHOLD and args.split_type != SAFE_SPLIT_TYPE:
        print(
            f"WARNING: val_auc={args.val_auc:.4f} > {LEAKAGE_VAL_AUC_THRESHOLD} "
            f"with split_type='{args.split_type}' — probable leakage"
        )


def cmd_list(args: argparse.Namespace) -> None:
    compare_experiments(Path(args.db))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Log and compare training experiments")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to SQLite experiments.db")
    sub = parser.add_subparsers(dest="command", required=True)

    add_parser = sub.add_parser("add", help="Add experiment record")
    add_parser.add_argument("--name", required=True)
    add_parser.add_argument("--val-auc", type=float, required=True)
    add_parser.add_argument("--test-auc", type=float, default=None)
    add_parser.add_argument("--model", default="efficientnet_b4")
    add_parser.add_argument("--pretrain", default="imagenet-1k")
    add_parser.add_argument("--split-type", default=SAFE_SPLIT_TYPE)
    add_parser.add_argument("--epochs", type=int, default=None)
    add_parser.add_argument("--notes", default="")
    add_parser.add_argument("--db", default=str(DEFAULT_DB))
    add_parser.set_defaults(func=cmd_add)

    list_parser = sub.add_parser("list", help="List experiments sorted by val_auc")
    list_parser.add_argument("--db", default=str(DEFAULT_DB))
    list_parser.set_defaults(func=cmd_list)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
