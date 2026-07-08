from __future__ import annotations

import math
from typing import Literal, Union

FibrosisRisk = Literal["low", "grey", "high"]

AST_UPPER_LIMIT = 40.0
FIB4_LOW_THRESHOLD = 1.3
FIB4_HIGH_THRESHOLD = 2.67

SerologyValue = Union[bool, int, float, str, None]


def _is_positive(value: SerologyValue) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value > 0
    normalized = str(value).strip().lower()
    return normalized in {
        "1",
        "true",
        "yes",
        "y",
        "+",
        "pos",
        "positive",
        "положительный",
        "положит",
        "да",
    }


def calc_fib4(age: float, ast: float, alt: float, platelets: float) -> float:
    if platelets <= 0 or alt <= 0:
        return 0.0
    return (age * ast) / (platelets * math.sqrt(alt))


def calc_apri(ast: float, platelets: float, upper_ast: float = AST_UPPER_LIMIT) -> float:
    if platelets <= 0 or upper_ast <= 0:
        return 0.0
    return ((ast / upper_ast) * 100) / platelets


def interpret_fib4(fib4: float) -> FibrosisRisk:
    if fib4 < FIB4_LOW_THRESHOLD:
        return "low"
    if fib4 <= FIB4_HIGH_THRESHOLD:
        return "grey"
    return "high"


def build_recommendation(
    fibrosis_risk: FibrosisRisk,
    fib4: float,
    apri: float,
    hbv_alert: bool,
    hcv_alert: bool,
) -> str:
    parts: list[str] = []

    if fibrosis_risk == "low":
        parts.append(
            f"FIB-4 {fib4:.2f} < 1.3 — низкий риск значимого фиброза (AASLD 2025). "
            "Продолжить наблюдение в ПМСП."
        )
    elif fibrosis_risk == "grey":
        parts.append(
            f"FIB-4 {fib4:.2f} в серой зоне (1.3–2.67) — неопределённый риск фиброза. "
            "Рекомендовано дообследование: УЗИ/эластография, повтор лабораторных показателей."
        )
    else:
        parts.append(
            f"FIB-4 {fib4:.2f} > 2.67 — высокий риск значимого фиброза. "
            "Направить на углублённую диагностику и консультацию гепатолога."
        )

    parts.append(f"APRI {apri:.2f} (верхняя норма АСТ {AST_UPPER_LIMIT:.0f} ЕД/Л).")

    if hbv_alert:
        parts.append("HBsAg положительный — определить вирусную нагрузку HBV (ДНК HBV).")
    if hcv_alert:
        parts.append("Anti-HCV положительный — подтвердить HCV РНК (вирусная нагрузка HCV).")
    if hbv_alert and hcv_alert:
        parts.append("Выявлена серологическая маркировка HBV и HCV — исключить ко-инфекцию.")

    return " ".join(parts)


def interpret_inlab(
    age: float,
    ast: float,
    alt: float,
    platelets: float,
    hbsag: SerologyValue,
    anti_hcv: SerologyValue,
) -> dict:
    fib4 = round(calc_fib4(age, ast, alt, platelets), 2)
    apri = round(calc_apri(ast, platelets), 2)
    fibrosis_risk = interpret_fib4(fib4)
    hbv_alert = _is_positive(hbsag)
    hcv_alert = _is_positive(anti_hcv)

    return {
        "fib4": fib4,
        "apri": apri,
        "fibrosis_risk": fibrosis_risk,
        "hbv_alert": hbv_alert,
        "hcv_alert": hcv_alert,
        "recommendation": build_recommendation(fibrosis_risk, fib4, apri, hbv_alert, hcv_alert),
    }
