import pytest

from app.inlab import calc_apri, calc_fib4, interpret_fib4, interpret_inlab


def test_calc_fib4_apri():
    fib4 = calc_fib4(50, 40, 40, 200)
    apri = calc_apri(40, 200)
    assert fib4 > 0
    assert apri > 0


def test_interpret_fib4_thresholds():
    assert interpret_fib4(1.0) == "low"
    assert interpret_fib4(1.3) == "grey"
    assert interpret_fib4(2.67) == "grey"
    assert interpret_fib4(2.68) == "high"


def test_interpret_inlab_low_risk():
    result = interpret_inlab(30, 25, 25, 250, hbsag=False, anti_hcv=False)
    assert result["fibrosis_risk"] == "low"
    assert result["hbv_alert"] is False
    assert result["hcv_alert"] is False
    assert "низкий риск" in result["recommendation"]


def test_interpret_inlab_serology_alerts():
    result = interpret_inlab(55, 65, 70, 140, hbsag="positive", anti_hcv="+")
    assert result["hbv_alert"] is True
    assert result["hcv_alert"] is True
    assert "HBV" in result["recommendation"]
    assert "HCV" in result["recommendation"]
