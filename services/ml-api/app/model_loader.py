from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent.parent / "models"
INPUT_SIZE = 300

CLASSES = [
    "Норма",
    "Стеатоз / NAFLD",
]

_torch_model = None
_onnx_session = None
_device = None


def _lazy_torch():
    import torch

    return torch


def load_models() -> None:
    global _torch_model, _onnx_session, _device

    onnx_path = MODELS_DIR / "liver_efficientnet_b3.onnx"
    pth_path = MODELS_DIR / "liver_efficientnet_b3_best.pth"

    if onnx_path.exists():
        try:
            import onnxruntime as ort

            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            _onnx_session = ort.InferenceSession(str(onnx_path), providers=providers)
            logger.info("ONNX model loaded: %s", onnx_path)
            return
        except Exception as exc:
            logger.warning("ONNX load failed: %s", exc)
            _onnx_session = None

    if pth_path.exists():
        try:
            torch = _lazy_torch()
            _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            from training.model import build_model

            model = build_model(num_classes=len(CLASSES), pretrained=False)
            ckpt = torch.load(pth_path, map_location=_device, weights_only=False)
            state = ckpt.get("model_state", ckpt)
            model.load_state_dict(state)
            model.to(_device).eval()
            _torch_model = model
            logger.info("PyTorch model loaded: %s on %s", pth_path, _device)
            return
        except Exception as exc:
            logger.warning("PyTorch load failed: %s", exc)
            _torch_model = None

    logger.warning("No vision weights found — using hash stub")


def is_stub_mode() -> bool:
    return _onnx_session is None and _torch_model is None


def get_onnx_session():
    return _onnx_session


def get_torch_model():
    return _torch_model


def get_device():
    if _device is not None:
        return _device
    torch = _lazy_torch()
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def preprocess_image_bytes(image_bytes: bytes) -> np.ndarray:
    from PIL import Image
    import io

    img = Image.open(io.BytesIO(image_bytes)).convert("L").convert("RGB")
    img = img.resize((INPUT_SIZE, INPUT_SIZE))
    arr = np.array(img).astype(np.float32) / 255.0
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    arr = np.transpose(arr, (2, 0, 1))
    return np.expand_dims(arr, axis=0).astype(np.float32)


def run_vision(image_bytes: bytes) -> tuple[str, float]:
    if is_stub_mode():
        raise RuntimeError("stub")

    input_arr = preprocess_image_bytes(image_bytes)

    if _onnx_session is not None:
        outputs = _onnx_session.run(None, {"input": input_arr})
        logits = outputs[0][0]
    elif _torch_model is not None:
        torch = _lazy_torch()
        device = get_device()
        with torch.no_grad():
            tensor = torch.from_numpy(input_arr).to(device)
            logits = _torch_model(tensor)[0].cpu().numpy()
    else:
        raise RuntimeError("no model")

    probs = _softmax(logits)
    idx = int(np.argmax(probs))
    return CLASSES[idx], float(probs[idx])


def _softmax(x: np.ndarray) -> np.ndarray:
    exp_x = np.exp(x - np.max(x))
    return exp_x / exp_x.sum()
