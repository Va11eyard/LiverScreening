from __future__ import annotations

import hashlib
import logging
import sys
from pathlib import Path
from typing import Any

from PIL import Image
import io

from app.explanations import build_explanation, default_region
from app.triage import (
    ClinicalInput,
    FIBROSIS_FROM_TIER,
    RISK_TIER_LABELS,
    STEATOSIS_FROM_TIER,
    run_clinical_triage,
)

logger = logging.getLogger(__name__)

TRAINING_ROOT = Path(__file__).resolve().parent.parent
if str(TRAINING_ROOT) not in sys.path:
    sys.path.insert(0, str(TRAINING_ROOT))

VISION_WEIGHT = 0.30
CLINICAL_WEIGHT = 0.70


def _parse_float(val: Any, default: float = 0.0) -> float:
    if val is None or val == "":
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def metadata_to_clinical(meta: dict[str, Any]) -> ClinicalInput:
    age = _parse_float(meta.get("age") or meta.get("ga"), 45)
    ast = _parse_float(meta.get("ast") or meta.get("ph"), 30)
    alt = _parse_float(meta.get("alt") or meta.get("pca"), 30)
    platelets = _parse_float(meta.get("platelets") or meta.get("bw"), 200)
    hbv_raw = str(meta.get("hbv") or meta.get("aprop") or "").lower()
    hbv = hbv_raw in ("да", "yes", "true", "1", "hbv+", "хвг+")
    etiology = str(meta.get("etiology") or meta.get("eye") or "")
    return ClinicalInput(
        age=age,
        ast=ast,
        alt=alt,
        platelets=platelets,
        hbv_positive=hbv,
        etiology=etiology,
    )


def _vision_stub(image_bytes: bytes) -> tuple[str, float]:
    digest = hashlib.sha256(image_bytes).hexdigest()
    bucket = int(digest[:8], 16) % 100
    if bucket < 50:
        return "Норма", 0.72
    return "Стеатоз / NAFLD", 0.84


def _run_vision(image_bytes: bytes) -> tuple[str, float, bool]:
    from app.model_loader import is_stub_mode, run_vision

    if is_stub_mode():
        finding, conf = _vision_stub(image_bytes)
        return finding, conf, True
    try:
        finding, conf = run_vision(image_bytes)
        return finding, conf, False
    except Exception as exc:
        logger.warning("Vision model failed, using stub: %s", exc)
        finding, conf = _vision_stub(image_bytes)
        return finding, conf, True


def _clinical_risk_score(triage) -> float:
    fib4_norm = min(triage.fib4 / 5.0, 1.0)
    apri_norm = min(triage.apri / 3.0, 1.0)
    return CLINICAL_WEIGHT * (0.6 * fib4_norm + 0.4 * apri_norm)


def _apply_fusion(triage, vision_conf: float, has_image: bool) -> None:
    if not has_image:
        return
    clinical_score = _clinical_risk_score(triage)
    fused = clinical_score + VISION_WEIGHT * vision_conf
    if triage.risk_tier == "low" and fused >= 0.35:
        triage.risk_tier = "watch"  # type: ignore[misc]
    if triage.risk_tier == "watch" and fused >= 0.55:
        triage.risk_tier = "urgent"  # type: ignore[misc]


def validate_image(image_bytes: bytes) -> None:
    img = Image.open(io.BytesIO(image_bytes))
    img.verify()


def run_inference(metadata: dict[str, Any], image_bytes: bytes | None) -> dict[str, Any]:
    from app.model_loader import is_stub_mode

    clinical = metadata_to_clinical(metadata)
    triage = run_clinical_triage(clinical)

    us_finding = None
    vision_conf = 0.75
    used_stub = is_stub_mode()
    if image_bytes:
        validate_image(image_bytes)
        us_finding, vision_conf, used_stub = _run_vision(image_bytes)
        _apply_fusion(triage, vision_conf, True)

    confidence = round(max(vision_conf, min(0.99, triage.fib4 / 5)), 2)
    explanation = build_explanation(
        triage.risk_tier, triage.fib4, triage.apri, clinical.hbv_positive, us_finding
    )

    return {
        "stage": FIBROSIS_FROM_TIER[triage.risk_tier],
        "plus_disease": STEATOSIS_FROM_TIER[triage.risk_tier],
        "zone": RISK_TIER_LABELS[triage.risk_tier],
        "rop_form": us_finding or "Без УЗИ",
        "pre_diag": clinical.etiology or ("ХВГ" if clinical.hbv_positive else "MASLD/НАЖБП"),
        "confidence": str(confidence),
        "aprop": "Да (ХВГ)" if clinical.hbv_positive else "Нет",
        "avasc_color": "",
        "fib4": str(triage.fib4),
        "apri": str(triage.apri),
        "risk_tier": triage.risk_tier,
        "explanation": explanation,
        "findings": [
            {
                "type": "liver_parenchyma",
                "region": default_region(confidence),
                "confidence": confidence,
            }
        ],
        "highlighted_fields": triage.highlighted_fields,
        "stub_mode": used_stub and is_stub_mode(),
        "model_loaded": not is_stub_mode(),
    }
