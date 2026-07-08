from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

ML_API_ROOT = Path(__file__).resolve().parent.parent
PRODUCTION_CHECKPOINT = ML_API_ROOT / "checkpoints" / "production" / "current.pt"
PRODUCTION_METADATA = ML_API_ROOT / "checkpoints" / "production" / "metadata.json"

CLASS_LABELS_RU: dict[str, str] = {
    "normal": "Норма",
    "steatosis": "Стеатоз / NAFLD",
    "fibrosis": "Фиброз",
    "cirrhosis": "Цирроз",
    "low_risk": "Низкий риск (норма/стеатоз)",
    "high_risk": "Высокий риск (фиброз/цирроз)",
}

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

_torch_model = None
_device = None
_model_info: dict[str, Any] = {
    "version": "unknown",
    "val_auc": None,
    "classes": 0,
    "class_names": [],
    "model_name": "efficientnet_b4",
    "input_size": 380,
    "loaded_at": None,
    "stub_mode": True,
}

def _lazy_torch():
    import torch

    return torch

def _read_metadata(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)

def _class_display_name(name: str) -> str:
    return CLASS_LABELS_RU.get(name, name.replace("_", " ").title())

def get_model_info() -> dict[str, Any]:
    return dict(_model_info)

def load_models() -> None:
    global _torch_model, _device, _model_info

    meta = _read_metadata(PRODUCTION_METADATA)
    ckpt_path = PRODUCTION_CHECKPOINT

    if not ckpt_path.exists():
        logger.warning("Production checkpoint missing: %s — using hash stub", ckpt_path)
        _torch_model = None
        _model_info.update(
            {
                "version": meta.get("version", "none"),
                "val_auc": meta.get("val_auc"),
                "classes": meta.get("classes", 0),
                "class_names": meta.get("class_names", []),
                "loaded_at": None,
                "stub_mode": True,
            }
        )
        return

    try:
        torch = _lazy_torch()
        import timm

        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        ckpt = torch.load(ckpt_path, map_location=_device, weights_only=False)

        num_classes = int(ckpt.get("num_classes") or meta.get("classes") or 4)
        model_name = str(ckpt.get("model_name") or meta.get("model_name") or "efficientnet_b4")
        class_names = list(ckpt.get("class_names") or meta.get("class_names") or [])
        input_size = int(meta.get("input_size") or 380)

        model = timm.create_model(model_name, pretrained=False, num_classes=num_classes, in_chans=3)
        state = ckpt.get("model_state", ckpt)
        model.load_state_dict(state)
        model.to(_device).eval()
        _torch_model = model

        loaded_at = datetime.now(timezone.utc).isoformat()
        _model_info = {
            "version": meta.get("version", "production"),
            "val_auc": meta.get("val_auc", ckpt.get("best_val_auc")),
            "classes": num_classes,
            "class_names": class_names,
            "model_name": model_name,
            "input_size": input_size,
            "loaded_at": loaded_at,
            "stub_mode": False,
        }
        logger.info(
            "Production model loaded: %s (%s, %d classes) on %s",
            ckpt_path,
            _model_info["version"],
            num_classes,
            _device,
        )
    except Exception as exc:
        logger.warning("Production model load failed: %s", exc)
        _torch_model = None
        _model_info.update({"loaded_at": None, "stub_mode": True})

def is_stub_mode() -> bool:
    return _torch_model is None

def get_torch_model():
    return _torch_model

def get_device():
    if _device is not None:
        return _device
    torch = _lazy_torch()
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")

def get_input_size() -> int:
    return int(_model_info.get("input_size") or 380)

def preprocess_image_bytes(image_bytes: bytes) -> np.ndarray:
    from PIL import Image
    import io

    size = get_input_size()
    img = Image.open(io.BytesIO(image_bytes)).convert("L").convert("RGB")
    img = img.resize((size, size))
    arr = np.array(img).astype(np.float32) / 255.0
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    arr = np.transpose(arr, (2, 0, 1))
    return np.expand_dims(arr, axis=0).astype(np.float32)

def run_vision(image_bytes: bytes) -> tuple[str, float]:
    if is_stub_mode():
        raise RuntimeError("stub")

    input_arr = preprocess_image_bytes(image_bytes)
    torch = _lazy_torch()
    device = get_device()
    with torch.no_grad():
        tensor = torch.from_numpy(input_arr).to(device)
        logits = _torch_model(tensor)[0].cpu().numpy()

    probs = _softmax(logits)
    idx = int(np.argmax(probs))
    class_names: list[str] = _model_info.get("class_names") or []
    if class_names and idx < len(class_names):
        label = _class_display_name(class_names[idx])
    else:
        label = f"Класс {idx}"
    return label, float(probs[idx])

def _softmax(x: np.ndarray) -> np.ndarray:
    exp_x = np.exp(x - np.max(x))
    return exp_x / exp_x.sum()
