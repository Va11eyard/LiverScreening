from __future__ import annotations

import math
from typing import Literal, Union

ChildPughClass = Literal["A", "B", "C"]
AscitesGrade = Union[int, str]
EncephalopathyGrade = Union[int, str]

PROTOCOLS = {
    "MASLD": {"code": "523", "name": "МАСЖБП", "title": "Приказ №523"},
    "ALD": {"code": "1082", "name": "АБП", "title": "Приказ №1082"},
    "HBV": {"code": "1071", "name": "ХВГ-B", "title": "Приказ №1071"},
    "HCV": {"code": "1056", "name": "ХВГ-C", "title": "Приказ №1056"},
}

DIAGNOSIS_ALIASES = {
    "K76.0": "MASLD",
    "K760": "MASLD",
    "MASLD": "MASLD",
    "NAFLD": "MASLD",
    "МАСЖБП": "MASLD",
    "523": "MASLD",
    "K70": "ALD",
    "K70.0": "ALD",
    "K70.1": "ALD",
    "ALD": "ALD",
    "АБП": "ALD",
    "1082": "ALD",
    "B18.0": "HBV",
    "B18.1": "HBV",
    "HBV": "HBV",
    "ХВГ-B": "HBV",
    "ХВГB": "HBV",
    "1071": "HBV",
    "B18.2": "HCV",
    "HCV": "HCV",
    "ХВГ-C": "HCV",
    "ХВГC": "HCV",
    "1056": "HCV",
}


def _grade_points(value: AscitesGrade | EncephalopathyGrade, kind: str) -> int:
    if isinstance(value, (int, float)):
        points = int(value)
        if points in (1, 2, 3):
            return points
        raise ValueError(f"{kind} grade must be 1, 2 or 3")

    normalized = str(value).strip().lower()
    ascites_map = {
        "none": 1,
        "нет": 1,
        "отсутствует": 1,
        "mild": 2,
        "лёгкий": 2,
        "легкий": 2,
        "умеренный": 2,
        "moderate": 2,
        "severe": 3,
        "тяжёлый": 3,
        "тяжелый": 3,
        "выраженный": 3,
    }
    enceph_map = {
        "none": 1,
        "нет": 1,
        "отсутствует": 1,
        "grade1": 2,
        "grade2": 2,
        "1-2": 2,
        "лёгкая": 2,
        "легкая": 2,
        "grade3": 3,
        "grade4": 3,
        "3-4": 3,
        "тяжёлая": 3,
        "тяжелая": 3,
    }
    mapping = ascites_map if kind == "ascites" else enceph_map
    if normalized not in mapping:
        raise ValueError(f"Unknown {kind} value: {value}")
    return mapping[normalized]


def _bilirubin_points(bilirubin_mg_dl: float) -> int:
    if bilirubin_mg_dl < 2.0:
        return 1
    if bilirubin_mg_dl <= 3.0:
        return 2
    return 3


def _albumin_points(albumin_g_dl: float) -> int:
    if albumin_g_dl > 3.5:
        return 1
    if albumin_g_dl >= 2.8:
        return 2
    return 3


def _inr_points(inr: float) -> int:
    if inr < 1.7:
        return 1
    if inr <= 2.3:
        return 2
    return 3


def calc_child_pugh(
    bilirubin_mg_dl: float,
    albumin_g_dl: float,
    ascites: AscitesGrade,
    encephalopathy: EncephalopathyGrade,
    inr: float | None = None,
    pt_seconds: float | None = None,
    pt_control_seconds: float = 12.0,
) -> dict:
    if inr is None:
        if pt_seconds is None or pt_control_seconds <= 0:
            raise ValueError("Provide inr or pt_seconds with pt_control_seconds")
        inr = pt_seconds / pt_control_seconds

    points = {
        "bilirubin": _bilirubin_points(bilirubin_mg_dl),
        "albumin": _albumin_points(albumin_g_dl),
        "inr": _inr_points(inr),
        "ascites": _grade_points(ascites, "ascites"),
        "encephalopathy": _grade_points(encephalopathy, "encephalopathy"),
    }
    score = sum(points.values())
    if score <= 6:
        child_class: ChildPughClass = "A"
    elif score <= 9:
        child_class = "B"
    else:
        child_class = "C"

    return {
        "score": score,
        "class": child_class,
        "points": points,
        "inr": round(inr, 2),
    }


def calc_meld_na(
    bilirubin_mg_dl: float,
    inr: float,
    creatinine_mg_dl: float,
    sodium_meq_l: float,
    dialysis: bool = False,
) -> float:
    bili = max(bilirubin_mg_dl, 1.0)
    inr_val = max(inr, 1.0)
    if dialysis:
        creatinine = 4.0
    else:
        creatinine = min(max(creatinine_mg_dl, 1.0), 4.0)
    sodium = min(max(sodium_meq_l, 125.0), 137.0)

    meld = (
        0.957 * math.log(creatinine)
        + 0.378 * math.log(bili)
        + 1.120 * math.log(inr_val)
        + 0.643
    )
    meld = round(meld)
    meld = max(6, min(meld, 40))

    if meld > 11:
        meld_na = meld + 1.32 * (137 - sodium) - 0.033 * meld * (137 - sodium)
    else:
        meld_na = float(meld)

    return round(max(6, min(meld_na, 40)))


def _child_pugh_class_from_score(score: float | int | None) -> ChildPughClass | None:
    if score is None:
        return None
    value = int(score)
    if value <= 6:
        return "A"
    if value <= 9:
        return "B"
    return "C"


def _resolve_protocol(diagnosis_code: str) -> dict:
    key = DIAGNOSIS_ALIASES.get(str(diagnosis_code).strip().upper())
    if key is None:
        raise ValueError(f"Unknown diagnosis_code: {diagnosis_code}")
    return {"key": key, **PROTOCOLS[key]}


class CDS_Engine:
    def calc_child_pugh(
        self,
        bilirubin_mg_dl: float,
        albumin_g_dl: float,
        ascites: AscitesGrade,
        encephalopathy: EncephalopathyGrade,
        inr: float | None = None,
        pt_seconds: float | None = None,
        pt_control_seconds: float = 12.0,
    ) -> dict:
        return calc_child_pugh(
            bilirubin_mg_dl=bilirubin_mg_dl,
            albumin_g_dl=albumin_g_dl,
            ascites=ascites,
            encephalopathy=encephalopathy,
            inr=inr,
            pt_seconds=pt_seconds,
            pt_control_seconds=pt_control_seconds,
        )

    def calc_meld_na(
        self,
        bilirubin_mg_dl: float,
        inr: float,
        creatinine_mg_dl: float,
        sodium_meq_l: float,
        dialysis: bool = False,
    ) -> float:
        return calc_meld_na(
            bilirubin_mg_dl=bilirubin_mg_dl,
            inr=inr,
            creatinine_mg_dl=creatinine_mg_dl,
            sodium_meq_l=sodium_meq_l,
            dialysis=dialysis,
        )

    def get_recommendation(
        self,
        diagnosis_code: str,
        fib4: float,
        child_pugh_score: float | int | None,
        meld_na: float | int | None,
    ) -> dict:
        protocol = _resolve_protocol(diagnosis_code)
        cp_class = _child_pugh_class_from_score(child_pugh_score)
        meld_value = float(meld_na) if meld_na is not None else None

        recommendations: list[str] = []
        monitoring: list[str] = []
        referral: list[str] = []

        recommendations.append(
            f"Клинический протокол: {protocol['name']} ({protocol['title']}, РК)."
        )

        if protocol["key"] == "MASLD":
            recommendations.extend(self._masld_rules(fib4))
            monitoring.extend(
                [
                    "Контроль АЛТ, АСТ, глюкозы, липидов каждые 6–12 мес.",
                    "Модификация образа жизни: снижение массы тела, отказ от алкоголя.",
                ]
            )
        elif protocol["key"] == "ALD":
            recommendations.extend(self._ald_rules(fib4, cp_class))
            monitoring.append("Полный отказ от алкоголя — обязательное условие ведения по протоколу АБП.")
        elif protocol["key"] == "HBV":
            recommendations.extend(self._hbv_rules(fib4, cp_class, meld_value))
            monitoring.append("Контроль ДНК HBV, HBsAg, АЛТ/АСТ каждые 3–6 мес.")
        elif protocol["key"] == "HCV":
            recommendations.extend(self._hcv_rules(fib4, cp_class, meld_value))
            monitoring.append("Подтверждение HCV РНК и оценка стадии фиброза перед терапией.")

        if cp_class == "B":
            referral.append("Child-Pugh B — консультация гепатолога, усиленный мониторинг осложнений.")
        elif cp_class == "C":
            referral.append(
                "Child-Pugh C — срочная консультация гепатолога/трансплантолога, "
                "оценка декомпенсации цирроза."
            )

        if meld_value is not None:
            if meld_value >= 15:
                referral.append(
                    f"MELD-Na {meld_value:.0f} ≥ 15 — рассмотреть направление в трансплантологический центр."
                )
            elif meld_value >= 10:
                monitoring.append(
                    f"MELD-Na {meld_value:.0f} — ускоренный мониторинг, исключить прогрессирование."
                )

        if fib4 > 2.67 and protocol["key"] in {"MASLD", "ALD"}:
            referral.append("FIB-4 > 2.67 — эластография/ФиброScan для подтверждения стадии фиброза.")

        summary = recommendations[1] if len(recommendations) > 1 else recommendations[0]

        return {
            "diagnosis_code": diagnosis_code,
            "protocol_key": protocol["key"],
            "protocol_name": protocol["name"],
            "protocol_order": protocol["title"],
            "fib4": round(float(fib4), 2),
            "child_pugh_score": child_pugh_score,
            "child_pugh_class": cp_class,
            "meld_na": meld_value,
            "recommendations": recommendations,
            "monitoring": monitoring,
            "referral": referral,
            "summary": summary,
        }

    def _masld_rules(self, fib4: float) -> list[str]:
        if fib4 < 1.3:
            return [
                "МАСЖБП: низкий риск фиброза (FIB-4 < 1.3).",
                "Первичное ведение в ПМСП, коррекция метаболических факторов риска.",
            ]
        if fib4 <= 2.67:
            return [
                "МАСЖБП: промежуточный риск фиброза (FIB-4 1.3–2.67).",
                "Направить на неинвазивную оценку фиброза (эластография) по приказу №523.",
            ]
        return [
            "МАСЖБП: высокий риск значимого фиброза (FIB-4 > 2.67).",
            "Консультация гепатолога, исключить прогрессирование до цирроза.",
        ]

    def _ald_rules(self, fib4: float, cp_class: ChildPughClass | None) -> list[str]:
        rules = ["АБП: абстиненция и оценка стадии фиброза обязательны."]
        if fib4 < 1.3:
            rules.append("FIB-4 < 1.3 — продолжить наблюдение при подтверждённой абстиненции.")
        elif fib4 <= 2.67:
            rules.append("FIB-4 1.3–2.67 — эластография и консультация гепатолога по протоколу №1082.")
        else:
            rules.append("FIB-4 > 2.67 — высокий риск фиброза/цирроза, углублённое обследование.")
        if cp_class in {"B", "C"}:
            rules.append("При декомпенсированном циррозе — госпитализация по клиническим показаниям.")
        return rules

    def _hbv_rules(
        self,
        fib4: float,
        cp_class: ChildPughClass | None,
        meld_na: float | None,
    ) -> list[str]:
        rules = ["ХВГ-B: оценить показания к противовирусной терапии по приказу №1071."]
        if fib4 >= 1.3:
            rules.append("FIB-4 ≥ 1.3 — показана оценка стадии фиброза и вирусной нагрузки HBV.")
        if cp_class is None and fib4 < 1.3:
            rules.append("При низком FIB-4 — мониторинг ДНК HBV и АЛТ каждые 6 мес.")
        if cp_class == "A":
            rules.append("Child-Pugh A — рассмотреть терапию тенофовир/энтекавир при активной репликации.")
        elif cp_class == "B":
            rules.append("Child-Pugh B — приоритетная консультация гепатолога, коррекция терапии HBV.")
        elif cp_class == "C":
            rules.append("Child-Pugh C — срочная помощь, оценка трансплантации и осложнений.")
        if meld_na is not None and meld_na >= 15:
            rules.append("MELD-Na ≥ 15 — трансплантологическая оценка по критериям UNOS.")
        return rules

    def _hcv_rules(
        self,
        fib4: float,
        cp_class: ChildPughClass | None,
        meld_na: float | None,
    ) -> list[str]:
        rules = ["ХВГ-C: подтвердить HCV РНК и оценить фиброз по приказу №1056."]
        if fib4 < 1.3:
            rules.append("FIB-4 < 1.3 — кандидат на противовирусную терапию ПППД в амбулаторном звене.")
        elif fib4 <= 2.67:
            rules.append("FIB-4 1.3–2.67 — эластография перед началом терапии, консультация гепатолога.")
        else:
            rules.append("FIB-4 > 2.67 — выраженный фиброз, ведение совместно с гепатологом.")
        if cp_class in {"B", "C"}:
            rules.append("Цирроз Child-Pugh B/C — индивидуальный план терапии и скрининг ГЦК.")
        if meld_na is not None and meld_na >= 15:
            rules.append("MELD-Na ≥ 15 — приоритетная трансплантологическая оценка.")
        return rules
