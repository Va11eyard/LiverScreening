import pytest

from app.cds import CDS_Engine, calc_child_pugh, calc_meld_na


def test_child_pugh_class_a():
    result = calc_child_pugh(
        bilirubin_mg_dl=1.5,
        albumin_g_dl=3.8,
        inr=1.2,
        ascites="none",
        encephalopathy="none",
    )
    assert result["score"] == 5
    assert result["class"] == "A"


def test_child_pugh_class_c():
    result = calc_child_pugh(
        bilirubin_mg_dl=4.0,
        albumin_g_dl=2.5,
        inr=2.5,
        ascites="severe",
        encephalopathy="grade3",
    )
    assert result["class"] == "C"
    assert result["score"] >= 10


def test_meld_na_range():
    score = calc_meld_na(
        bilirubin_mg_dl=2.0,
        inr=1.5,
        creatinine_mg_dl=1.2,
        sodium_meq_l=135,
    )
    assert 6 <= score <= 40


def test_cds_recommendation_masld():
    engine = CDS_Engine()
    result = engine.get_recommendation("MASLD", fib4=1.0, child_pugh_score=5, meld_na=8)
    assert result["protocol_key"] == "MASLD"
    assert result["protocol_order"] == "Приказ №523"
    assert result["child_pugh_class"] == "A"
    assert any("МАСЖБП" in item for item in result["recommendations"])


def test_cds_recommendation_hbv_with_meld():
    engine = CDS_Engine()
    result = engine.get_recommendation("HBV", fib4=2.0, child_pugh_score=8, meld_na=18)
    assert result["protocol_key"] == "HBV"
    assert result["child_pugh_class"] == "B"
    assert any("трансплант" in item.lower() for item in result["referral"])


def test_unknown_diagnosis_raises():
    engine = CDS_Engine()
    with pytest.raises(ValueError):
        engine.get_recommendation("UNKNOWN", fib4=1.0, child_pugh_score=5, meld_na=8)
