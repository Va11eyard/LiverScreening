from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import httpx

from app.inference import metadata_to_clinical, run_inference
from app.model_loader import get_model_info, is_stub_mode, load_models
from app.triage import run_clinical_triage

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_models()
    logger.info("Vision stub mode: %s", is_stub_mode())
    yield

app = FastAPI(
    title="Liver Screening ML API",
    description="Clinical triage + ultrasound inference for PMSP liver/HBV screening",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ClinicalTriageRequest(BaseModel):
    age: float = Field(..., ge=0, le=120)
    ast: float = Field(..., ge=0)
    alt: float = Field(..., ge=0)
    platelets: float = Field(..., gt=0)
    hbv_positive: bool = False
    etiology: str = ""

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class ChatAdvisorRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list)


@app.post("/chat/advisor")
def chat_advisor(body: ChatAdvisorRequest) -> dict[str, Any]:
    from app.chat_advisor import advise

    try:
        history = [m.model_dump() for m in body.history]
        return advise(history, body.message.strip())
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail="LLM provider error") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="chat failed") from exc

@app.get("/health")
def health() -> dict[str, str | float | int | bool | None]:
    info = get_model_info()
    return {
        "status": "ok",
        "service": "liver-ml-api",
        "model_version": info.get("version"),
        "val_auc": info.get("val_auc"),
        "classes": info.get("classes"),
        "loaded_at": info.get("loaded_at"),
        "stub_mode": is_stub_mode(),
    }

@app.post("/triage/clinical")
def triage_clinical(body: ClinicalTriageRequest) -> dict[str, Any]:
    from app.triage import ClinicalInput

    clinical = ClinicalInput(
        age=body.age,
        ast=body.ast,
        alt=body.alt,
        platelets=body.platelets,
        hbv_positive=body.hbv_positive,
        etiology=body.etiology,
    )
    result = run_clinical_triage(clinical)
    return {
        "fib4": result.fib4,
        "apri": result.apri,
        "risk_tier": result.risk_tier,
        "recommendation": result.recommendation,
        "highlighted_fields": result.highlighted_fields,
    }

@app.post("/inference")
async def inference(
    metadata: str = Form(...),
    image: UploadFile | None = File(None),
) -> dict[str, Any]:
    try:
        meta = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="invalid metadata JSON") from exc

    image_bytes = None
    if image is not None and image.filename:
        image_bytes = await image.read()
        if len(image_bytes) == 0:
            image_bytes = None

    if image_bytes is None and not meta:
        raise HTTPException(status_code=400, detail="image or clinical metadata required")

    try:
        return run_inference(meta, image_bytes)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

@app.post("/predict")
async def predict(
    metadata: str = Form(...),
    image: UploadFile | None = File(None),
) -> dict[str, Any]:
    return await inference(metadata=metadata, image=image)

@app.post("/")
async def inference_root(
    metadata: str = Form(...),
    image: UploadFile | None = File(None),
) -> dict[str, Any]:
    return await inference(metadata=metadata, image=image)
