from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

RiskTier = Literal["low", "watch", "urgent", "refer_hepatology"]


@dataclass
class ClinicalInput:
    age: float
    ast: float
    alt: float
    platelets: float
    hbv_positive: bool = False
    etiology: str = ""


@dataclass
class TriageResult:
    fib4: float
    apri: float
    risk_tier: RiskTier
    recommendation: str
    highlighted_fields: list[str]


def calc_fib4(age: float, ast: float, alt: float, platelets: float) -> float:
    if platelets <= 0 or alt <= 0:
        return 0.0
    return (age * ast) / (platelets * (alt**0.5))


def calc_apri(ast: float, platelets: float) -> float:
    upper_ast = 40.0
    if platelets <= 0:
        return 0.0
    return ((ast / upper_ast) * 100) / platelets


def fuse_risk(fib4: float, apri: float, hbv: bool) -> RiskTier:
    if fib4 >= 3.25 or apri >= 2.0:
        return "refer_hepatology"
    if fib4 >= 1.45 or apri >= 1.5 or (hbv and (fib4 >= 1.3 or apri >= 1.0)):
        return "urgent"
    if fib4 >= 1.3 or apri >= 0.7:
        return "watch"
    return "low"


def recommendation_for(tier: RiskTier) -> str:
    mapping = {
        "low": "Продолжить наблюдение в ПМСП, контроль через 12 мес.",
        "watch": "Повторить анализы через 6 мес., УЗИ контроль, консультация терапевта.",
        "urgent": "Углублённое обследование, направление на ФиброScan/эластографию.",
        "refer_hepatology": "Срочное направление к гепатологу, исключить декомпенсацию.",
    }
    return mapping[tier]


def highlighted_for(fib4: float, apri: float, clinical: ClinicalInput) -> list[str]:
    fields: list[str] = []
    if clinical.ast > 40:
        fields.append("ast")
    if clinical.alt > 40:
        fields.append("alt")
    if clinical.platelets < 150:
        fields.append("platelets")
    if fib4 >= 1.3:
        fields.append("fib4")
    if apri >= 0.7:
        fields.append("apri")
    if clinical.hbv_positive:
        fields.append("hbv")
    return fields


def run_clinical_triage(clinical: ClinicalInput) -> TriageResult:
    fib4 = round(calc_fib4(clinical.age, clinical.ast, clinical.alt, clinical.platelets), 2)
    apri = round(calc_apri(clinical.ast, clinical.platelets), 2)
    tier = fuse_risk(fib4, apri, clinical.hbv_positive)
    return TriageResult(
        fib4=fib4,
        apri=apri,
        risk_tier=tier,
        recommendation=recommendation_for(tier),
        highlighted_fields=highlighted_for(fib4, apri, clinical),
    )


RISK_TIER_LABELS = {
    "low": "Низкий риск",
    "watch": "Наблюдение",
    "urgent": "Срочно",
    "refer_hepatology": "К гепатологу",
}

STEATOSIS_FROM_TIER = {
    "low": "Нет / минимальный",
    "watch": "Лёгкий стеатоз",
    "urgent": "Умеренный стеатоз",
    "refer_hepatology": "Выраженный стеатоз",
}

FIBROSIS_FROM_TIER = {
    "low": "F0–F1",
    "watch": "F1–F2",
    "urgent": "F2–F3",
    "refer_hepatology": "F3–F4",
}
