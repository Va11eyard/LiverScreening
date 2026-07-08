from __future__ import annotations

from typing import Any


def build_explanation(
    risk_tier: str,
    fib4: float,
    apri: float,
    hbv: bool,
    us_finding: str | None = None,
) -> dict[str, Any]:
    us_part = us_finding or "Признаки изменения эхогенности паренхимы печени"
    hbv_note = " Учтён ХВГ при оценке риска фиброза." if hbv else ""

    titles = {
        "low": "Низкий риск фиброза",
        "watch": "Признаки ранних изменений печени",
        "urgent": "Повышенный риск фиброза",
        "refer_hepatology": "Высокий риск advanced fibrosis",
    }
    return {
        "title": titles.get(risk_tier, "Результат скрининга"),
        "summary": f"{us_part}. FIB-4={fib4}, APRI={apri}.{hbv_note}",
        "reasoning": [
            f"FIB-4 {'≥' if fib4 >= 1.3 else '<'} 1.3 — маркер фиброза",
            f"APRI {'≥' if apri >= 0.7 else '<'} 0.7 — неинвазивная оценка",
            "УЗИ: оценка эхоструктуры паренхимы",
        ],
        "recommendation": _REC.get(risk_tier, "Консультация специалиста"),
        "triage_action": risk_tier,
    }


_REC = {
    "low": "Продолжить наблюдение в ПМСП, контроль через 12 мес.",
    "watch": "Повторить анализы через 6 мес., УЗИ контроль, консультация терапевта.",
    "urgent": "Углублённое обследование, направление на ФиброScan/эластографию.",
    "refer_hepatology": "Срочное направление к гепатологу, исключить декомпенсацию.",
}


def default_region(confidence: float) -> dict[str, float]:
    jitter = (confidence - 0.5) * 0.04
    return {
        "cx": 0.62 + jitter,
        "cy": 0.45,
        "rx": 0.18,
        "ry": 0.22,
    }
