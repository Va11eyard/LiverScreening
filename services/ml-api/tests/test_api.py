import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.triage import calc_apri, calc_fib4, fuse_risk, run_clinical_triage, ClinicalInput

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


def test_fib4_apri():
    assert calc_fib4(50, 40, 40, 200) > 0
    assert calc_apri(40, 200) > 0


def test_fuse_risk_refer():
    assert fuse_risk(3.5, 0.5, False) == "refer_hepatology"
    assert fuse_risk(1.0, 2.1, False) == "refer_hepatology"


def test_clinical_triage_endpoint():
    r = client.post(
        "/triage/clinical",
        json={"age": 55, "ast": 65, "alt": 70, "platelets": 140, "hbv_positive": True},
    )
    assert r.status_code == 200
    data = r.json()
    assert "fib4" in data
    assert data["risk_tier"] in ("low", "watch", "urgent", "refer_hepatology")


def test_inference_multipart():
    img = Image.new("RGB", (128, 128), color=(120, 100, 80))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    metadata = (
        '{"case_id":"LIV-2026-001","age":"55","ast":"65","alt":"70",'
        '"platelets":"140","hbv":"yes","etiology":"HBV"}'
    )
    r = client.post(
        "/inference",
        data={"metadata": metadata},
        files={"image": ("us.png", buf.getvalue(), "image/png")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["stage"]
    assert body["zone"]
    assert "explanation" in body
    assert body["findings"][0]["region"]["cx"] > 0


def test_run_clinical_triage_low():
    result = run_clinical_triage(ClinicalInput(30, 25, 25, 250, False))
    assert result.risk_tier == "low"
