# AI_BUILD_PLAN.md — HepatoScreen: ИИ-скрининг патологий печени

> **Статус:** Версия 1.0 | 48–72ч после хакатона
> **Цель:** Заменить hash-based vision stub на обученную EfficientNet + интегрировать в ML API
> **GPU:** RTX 5050 Laptop, ~8GB VRAM | Mixed precision обязателен
> **Stack:** PyTorch → ONNX | FastAPI | Docker | CI/CD (будущее)

---

## Executive Summary

HepatoScreen ML-составляющая сейчас работает на hash-based stub (`_vision_stub` в `inference.py`). Этот план описывает шаги по обучению реальной модели (EfficientNet-B3, primary) на ультразвуковых снимках печени, экспорту в ONNX и интеграции в FastAPI ML-сервис. EfficientNet-B0 оставлен как fallback для сравнения и при ограниченном VRAM. Общий таймлайн: **48–72 часа чистого времени** (при наличии GPU и данных).

---

## Таблица фаз (Overview)

| Phase | Название | Файлы | Время | Blockers |
|---|---|---|---|---|
| 0 | Стабилизация stub | `inference.py`, `main.py` | 2ч | — |
| 1 | Data Pipeline | `data/`, `train_efficientnet.py` (dataset) | 6–10ч | Отсутствие размеченных данных |
| 2 | Training | `train_efficientnet.py`, `model.py` | 12–18ч | VRAM OOM, переобучение |
| 3 | Export | `export_onnx.py`, `models/` | 3–4ч | Несовместимость opset |
| 4 | Integration | `inference.py`, `requirements.txt` | 6–8ч | Torch vs ONNX runtime, Grad-CAM |
| 5 | Eval & Pitch | `eval.ipynb`, `docs/metrics/` | 4–6ч | Нужна тестовая выборка |

**Общее:** 33–48ч чистого времени + 8–12ч буфера на отладку = **41–60ч**

> **Примечание:** "Фазы" 0–5 в этом документе — это **часовые шаги** (build steps), не стратегические этапы. Стратегические фазы см. в AI_STRATEGY.md.

---

## Фаза 0: Стабилизация stub и подготовка репо (2ч)

### Цель
Подготовить ML API к приёму реальных весов: структура директорий, lifespan events, graceful fallback.

### Файлы

```
services/ml-api/
├── app/
│   ├── main.py              # ← добавить lifespan event
│   ├── inference.py         # ← рефактор: интерфейс run_inference() не менять!
│   └── model_loader.py      # ← НОВЫЙ: загрузка весов при старте
├── models/
│   ├── .gitignore           # ← ignore *.pth, *.onnx, *.pt
│   └── README.md            # ← инструкция: куда класть веса
├── data/
│   ├── raw/
│   ├── processed/
│   └── .gitignore
├── training/
│   ├── train_efficientnet.py    # ← НОВЫЙ (Фаза 2)
│   ├── model.py                 # ← адаптировать из docs/training-code/
│   ├── dataset.py               # ← адаптировать из docs/training-code/
│   ├── export_onnx.py           # ← адаптировать из docs/training-code/
│   └── config.yaml              # ← адаптировать из docs/training-code/
└── notebooks/
    └── eval.ipynb             # ← НОВЫЙ (Фаза 5)
```

### Команды

```bash
# 0.1 Создать структуру
cd /path/to/LiverScreening/services/ml-api
mkdir -p models data/raw data/processed training notebooks

# 0.2 .gitignore для моделей и данных
cat > models/.gitignore << 'EOF'
*.pth
*.onnx
*.pt
*.ckpt
EOF

cat > data/.gitignore << 'EOF'
raw/
processed/
EOF

# 0.3 Скопировать архив training-code как основу
cp docs/training-code/train.py training/train_efficientnet.py
cp docs/training-code/model.py training/model.py
cp docs/training-code/dataset.py training/dataset.py
cp docs/training-code/export_onnx.py training/export_onnx.py
cp docs/training-code/config.yaml training/config.yaml

# 0.4 Проверить, что FastAPI стартует
cd services/ml-api
docker compose up ml-api   # или: uvicorn app.main:app --reload --port 8000
```

### model_loader.py (новый файл)

```python
# services/ml-api/app/model_loader.py
import os
import logging
from pathlib import Path
import torch
import onnxruntime as ort

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent.parent / "models"

# Глобальные переменные — загружаются при старте
_onnx_session: ort.InferenceSession | None = None
_torch_model: torch.nn.Module | None = None
_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

CLASSES = ["Норма", "Гиперэхогенность паренхимы", "Неоднородная эхоструктура", "Признаки стеатоза / фиброза"]
NUM_CLASSES = len(CLASSES)


def load_models():
    """Вызывается из FastAPI lifespan event при старте."""
    global _onnx_session, _torch_model

    # 1. Пробуем ONNX
    onnx_path = MODELS_DIR / "liver_efficientnet_b3.onnx"
    if onnx_path.exists():
        try:
            _onnx_session = ort.InferenceSession(
                str(onnx_path),
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
            )
            logger.info(f"ONNX model loaded: {onnx_path} ({_get_onnx_input_shape()})")
            return
        except Exception as e:
            logger.warning(f"ONNX load failed: {e}")

    # 2. Fallback на TorchScript
    ts_path = MODELS_DIR / "liver_efficientnet_b3.pt"
    if ts_path.exists():
        try:
            _torch_model = torch.jit.load(str(ts_path), map_location=_device)
            _torch_model.eval()
            logger.info(f"TorchScript model loaded: {ts_path}")
            return
        except Exception as e:
            logger.warning(f"TorchScript load failed: {e}")

    # 3. Fallback на PyTorch state_dict
    pth_path = MODELS_DIR / "liver_efficientnet_b3.pth"
    if pth_path.exists():
        try:
            from training.model import build_model  # relative import workaround
            _torch_model = build_model(num_classes=NUM_CLASSES)
            _torch_model.load_state_dict(torch.load(pth_path, map_location=_device))
            _torch_model.to(_device).eval()
            logger.info(f"PyTorch model loaded: {pth_path}")
            return
        except Exception as e:
            logger.warning(f"PyTorch load failed: {e}")

    logger.warning("No real model found. Running in STUB mode.")


def _get_onnx_input_shape() -> list:
    if _onnx_session is None:
        return []
    return [inp.shape for inp in _onnx_session.get_inputs()]


def is_stub_mode() -> bool:
    return _onnx_session is None and _torch_model is None


def get_onnx_session() -> ort.InferenceSession | None:
    return _onnx_session


def get_torch_model() -> torch.nn.Module | None:
    return _torch_model


def get_device() -> torch.device:
    return _device
```

### Модификация main.py

```python
# Добавить в app/main.py
from contextlib import asynccontextmanager
from app.model_loader import load_models

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_models()
    yield
    # cleanup при shutdown

app = FastAPI(lifespan=lifespan)
```

### Оценка: 2ч

### Blockers
- **Нет** — чистая подготовительная работа.

---

## Фаза 1: Data Pipeline (6–10ч)

### Цель
Собрать и подготовить датасет УЗИ печени с разметкой по классам. Минимум: 500–1000 изображений (100+ на класс).

### 1.1 Экспорт из HepatoScreen (apps/web)

```bash
# HepatoScreen уже имеет endpoint /reports/training-export
# Вручную или через скрипт:

# 1.1.1 Скачать ZIP через UI
curl -o hepato_export.zip http://localhost:3004/reports/training-export
# или через UI кликнуть "Экспорт для обучения"

# 1.1.2 Распаковать
unzip hepato_export.zip -d data/raw/hepato_export/
# Ожидается структура:
# hepato_export/
#   ├── images/
#   │   ├── case_001_us.jpg
#   │   ├── case_002_us.jpg
#   │   └── ...
#   └── cases.csv
# Колонки: case_id, age, ast, alt, platelets, hbv, etiology, stage, notes, hospital, doctor, date, image_path
```

### 1.2 Интеграция открытых датасетов

| Датасет | URL | Классы | ~Кол-во | Лицензия |
|---|---|---|---|---|
| Mendeley NAFLD Ultrasound | https://data.mendeley.com/datasets/… | Норма, Стеатоз, Фиброз | ~500 | CC BY 4.0 |
| Liver Ultrasound Images | Kaggle — поиск "liver ultrasound classification" | Норма, Цирроз, Гепатома | ~2000 | Various |
| BUSI (Breast) — не подходит | — | — | — | — |
| Собственные данные HepatoScreen | training-export | по клиническим данным | ? | Внутренние |

```bash
# 1.2.1 Скачать открытые датасеты
mkdir -p data/raw/{mendeley,kaggle_synthetic}

# Mendeley — ручная загрузка или API (если доступен)
# Класть в: data/raw/mendeley/
# Ожидаемая структура:
# mendeley/
#   ├── normal/
#   ├── fatty_liver/   (steatosis)
#   └── fibrosis/

# Kaggle — если нашли подходящий
kaggle datasets download -d <dataset-name> -p data/raw/kaggle_synthetic/
unzip data/raw/kaggle_synthetic/*.zip -d data/raw/kaggle_synthetic/
```

### 1.3 EDA и разметка

```bash
# 1.3.1 Jupyter: посмотреть что пришло из HepatoScreen
cd services/ml-api
jupyter notebook notebooks/
# → Создать 01_eda.ipynb: распределение по классам, качество изображений
```

```python
# 01_eda.ipynb — key cells
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path

df = pd.read_csv("data/raw/hepato_export/cases.csv")
print(df.shape)
print(df['stage'].value_counts())  # или etiology как proxy для класса

# Визуализация распределения
df['stage'].value_counts().plot(kind='bar')
plt.title("Распределение по стадиям/классам")
plt.savefig("data/processed/class_distribution.png")
```

### 1.4 Маппинг клинических данных → vision классы

Клинические данные (AST, ALT, platelets, FIB-4) + УЗИ изображение → нужен маппинг в 4 класса:

| Класс | ID | Критерии (примерный маппинг) |
|---|---|---|
| Норма | 0 | FIB-4 < 1.45, ALT/AST норма, УЗИ — однородная эхоструктура |
| Гиперэхогенность | 1 | FIB-4 < 1.45, УЗИ — повышенная эхогенность (стеатоз) |
| Неоднородность | 2 | 1.45 ≤ FIB-4 < 3.25, УЗИ — неоднородность |
| Стеатоз/Фиброз | 3 | FIB-4 ≥ 3.25 или APRI > 1.0, УЗИ — выраженные изменения |

```python
# data_pipeline.py — НОВЫЙ
def assign_class(row: pd.Series) -> int:
    """Маппинг клинических данных + stage в vision класс."""
    # Используем stage как primary, если доступен
    stage_map = {
        "F0": 0, "F1": 1, "F2": 2, "F3": 3, "F4": 3,
        "норма": 0, "стеатоз": 1, "неоднородность": 2,
        "фиброз": 3, "цирроз": 3
    }
    if pd.notna(row.get("stage")) and str(row["stage"]).lower() in stage_map:
        return stage_map[str(row["stage"]).lower()]

    # Fallback: FIB-4 расчёт
    ast = row.get("ast", 0) or row.get("ph", 0)
    alt = row.get("alt", 0) or row.get("pca", 0)
    plt = row.get("platelets", 0) or row.get("bw", 0)
    age = row.get("age", 0) or row.get("ga", 0)

    if ast > 0 and plt > 0:
        fib4 = (age * ast) / (plt * (alt ** 0.5)) if alt > 0 else 0
        if fib4 < 1.45: return 1 if "steat" in str(row.get("notes", "")).lower() else 0
        elif fib4 < 3.25: return 2
        else: return 3
    return 0  # default
```

### 1.5 Объединение всех источников

```
data/processed/
├── train/
│   ├── 0_normal/
│   ├── 1_hyper/          (гиперэхогенность)
│   ├── 2_hetero/         (неоднородность)
│   └── 3_steatofibro/    (стеатоз/фиброз)
├── val/
│   └── (та же структура)
├── test/
│   └── (та же структура)
└── metadata.csv          # все записи: file_path, class_id, source, case_id, fib4, apri
```

```python
# merge_datasets.py — НОВЫЙ
import shutil
from sklearn.model_selection import train_test_split

# Сплит: 70% train / 15% val / 15% test
def split_and_copy(df, out_dir):
    train_df, temp_df = train_test_split(df, test_size=0.3, stratify=df['class_id'])
    val_df, test_df = train_test_split(temp_df, test_size=0.5, stratify=temp_df['class_id'])

    for split_name, split_df in [("train", train_df), ("val", val_df), ("test", test_df)]:
        for _, row in split_df.iterrows():
            dst_dir = Path(out_dir) / split_name / f"{row['class_id']}_{CLASSES[row['class_id']]}"
            dst_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(row['file_path'], dst_dir / Path(row['file_path']).name)
```

### 1.6 Preprocessing пайплайн

```python
# training/dataset.py — адаптировать из docs/training-code/
import torch
from torchvision import transforms
from PIL import Image
import numpy as np

# Размер для EfficientNet-B3: 224x224
INPUT_SIZE = 224

# Train transforms — медицинские УЗИ: консервативные аугментации
train_transform = transforms.Compose([
    transforms.Resize((256, 256)),
    transforms.RandomCrop((INPUT_SIZE, INPUT_SIZE)),
    transforms.RandomHorizontalFlip(p=0.3),  # УЗИ печени: горизонтальный флип допустим
    transforms.RandomVerticalFlip(p=0.1),    # редко, но возможно
    transforms.RandomRotation(degrees=10),   # небольшой поворот
    transforms.ColorJitter(brightness=0.1, contrast=0.1),  # УЗИ: яркость/контраст варьируется
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],  # ImageNet stats (RGB)
                         std=[0.229, 0.224, 0.225])
])

# Val/Test transforms
val_transform = transforms.Compose([
    transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225])
])

# Для grayscale УЗИ: дублируем в 3 канала
def load_us_image(path: str) -> Image.Image:
    """Загружает УЗИ, конвертирует grayscale → RGB."""
    img = Image.open(path).convert("L")  # grayscale
    return img.convert("RGB")  # 3 канала для EfficientNet

# Датасет
class LiverUSDataset(torch.utils.data.Dataset):
    def __init__(self, csv_path, transform=None):
        self.df = pd.read_csv(csv_path)
        self.transform = transform or val_transform

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        image = load_us_image(row['file_path'])
        if self.transform:
            image = self.transform(image)
        label = row['class_id']
        return image, torch.tensor(label, dtype=torch.long)
```

### Команды

```bash
# 1.6 Установить зависимости для обучения
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install pandas scikit-learn matplotlib seaborn opencv-python albumentations
pip install pytorch-grad-cam timm wandb  # wandb — опционально для логирования

# 1.7 Проверить dataloader
cd services/ml-api
python -c "
from training.dataset import LiverUSDataset
ds = LiverUSDataset('data/processed/metadata.csv')
print(f'Dataset size: {len(ds)}')
img, label = ds[0]
print(f'Image shape: {img.shape}, Label: {label}')
"
```

### Оценка: 6–10ч

| Подзадача | Время |
|---|---|
| Экспорт из HepatoScreen + разбор | 1ч |
| Поиск и загрузка открытых датасетов | 2ч |
| EDA + маппинг клин→классы | 2ч |
| Merge + split + структура | 1ч |
| dataset.py + проверка loader | 1–2ч |
| Дебаг грязных данных | 1–2ч |

### Blockers

| Риск | Вероятность | Митигация |
|---|---|---|
| HepatoScreen export пустой/без изображений | Medium | Использовать только открытые датасеты |
| Открытые датасеты — другие классы | Medium | Remap классов или уменьшить num_classes |
| <100 изображений на класс | High | Синтетическая аугментация (Albumentations), GAN |
| Нет разметки stage/etiology | Medium | Использовать FIB-4 как proxy |

---

## Фаза 2: Обучение EfficientNet (12–18ч)

### Цель
Адаптировать код из `docs/training-code/` под классификацию УЗИ печени, обучить на RTX 5050 с mixed precision.

### 2.1 Адаптация model.py

```python
# training/model.py — адаптировать
import torch
import torch.nn as nn
import timm

def build_model(num_classes: int = 4, pretrained: bool = True) -> nn.Module:
    """
    EfficientNet-B3 для классификации УЗИ печени.
    Input: 3x224x224 (RGB, grayscale дублирован в 3 канала)
    Output: logits [num_classes]
    """
    model = timm.create_model(
        "efficientnet_b3",
        pretrained=pretrained,
        num_classes=num_classes,
        in_chans=3,
    )
    return model


def get_loss_function(class_weights: torch.Tensor | None = None):
    """CrossEntropy с весами для несбалансированных классов."""
    return nn.CrossEntropyLoss(weight=class_weights)


def get_optimizer(model: nn.Module, lr: float = 1e-3, weight_decay: float = 1e-4):
    """AdamW — стандарт для fine-tuning EfficientNet."""
    # Разные LR для backbone и classifier head
    backbone_params = []
    head_params = []
    for name, param in model.named_parameters():
        if "classifier" in name or "head" in name:
            head_params.append(param)
        else:
            backbone_params.append(param)

    return torch.optim.AdamW([
        {"params": backbone_params, "lr": lr * 0.1},  # меньший LR для backbone
        {"params": head_params, "lr": lr},             # больший для head
    ], weight_decay=weight_decay)


def get_scheduler(optimizer, epochs: int, steps_per_epoch: int):
    """CosineAnnealingWarmRestarts для устойчивого обучения."""
    return torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer, T_0=10, T_mult=2
    )
```

### 2.2 Адаптация train_efficientnet.py

```python
# training/train_efficientnet.py — основной скрипт обучения
#!/usr/bin/env python3
"""
Train EfficientNet-B3 on Liver Ultrasound dataset.
GPU: RTX 5050 Laptop, ~8GB VRAM → mixed precision required.
"""

import os
import yaml
import logging
import argparse
from pathlib import Path
from datetime import datetime

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torch.cuda.amp import autocast, GradScaler
from sklearn.metrics import balanced_accuracy_score, f1_score
import wandb

from model import build_model, get_loss_function, get_optimizer, get_scheduler
from dataset import LiverUSDataset, train_transform, val_transform

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Config (RTX 5050 optimized) ───────────────────────────────────────
DEFAULT_CONFIG = {
    "model": "efficientnet_b3",
    "num_classes": 4,
    "input_size": 224,
    "batch_size": 16,           # RTX 5050 ~8GB: 16 с mixed precision
    "epochs": 50,
    "lr": 1e-3,
    "weight_decay": 1e-4,
    "label_smoothing": 0.1,
    "early_stopping_patience": 10,
    "num_workers": 4,
    "seed": 42,
    "use_amp": True,            # mixed precision — must for 8GB
    "grad_clip": 1.0,           # gradient clipping
    "save_dir": "models/",
    "csv_train": "data/processed/metadata_train.csv",
    "csv_val": "data/processed/metadata_val.csv",
}


def set_seed(seed: int):
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    import numpy as np
    np.random.seed(seed)


def train_epoch(model, loader, criterion, optimizer, scaler, device, use_amp):
    model.train()
    total_loss = 0.0
    all_preds, all_labels = [], []

    for batch_idx, (images, labels) in enumerate(loader):
        images, labels = images.to(device), labels.to(device)

        optimizer.zero_grad()

        with autocast(enabled=use_amp):
            outputs = model(images)
            loss = criterion(outputs, labels)

        scaler.scale(loss).backward()
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), DEFAULT_CONFIG["grad_clip"])
        scaler.step(optimizer)
        scaler.update()

        total_loss += loss.item()
        preds = outputs.argmax(dim=1).cpu().numpy()
        all_preds.extend(preds)
        all_labels.extend(labels.cpu().numpy())

    acc = balanced_accuracy_score(all_labels, all_preds)
    f1 = f1_score(all_labels, all_preds, average="weighted")
    return total_loss / len(loader), acc, f1


@torch.no_grad()
def validate(model, loader, criterion, device, use_amp):
    model.eval()
    total_loss = 0.0
    all_preds, all_labels = [], []

    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        with autocast(enabled=use_amp):
            outputs = model(images)
            loss = criterion(outputs, labels)
        total_loss += loss.item()
        preds = outputs.argmax(dim=1).cpu().numpy()
        all_preds.extend(preds)
        all_labels.extend(labels.cpu().numpy())

    acc = balanced_accuracy_score(all_labels, all_preds)
    f1 = f1_score(all_labels, all_preds, average="weighted")
    return total_loss / len(loader), acc, f1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=str, default="training/config.yaml")
    parser.add_argument("--resume", type=str, default=None, help="Resume from checkpoint")
    args = parser.parse_args()

    # Load config
    config = DEFAULT_CONFIG.copy()
    if os.path.exists(args.config):
        with open(args.config) as f:
            config.update(yaml.safe_load(f))

    set_seed(config["seed"])

    # Device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Device: {device}")
    if device.type == "cuda":
        logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
        logger.info(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    # W&B
    wandb.init(project="hepatoscreen", config=config)

    # Datasets
    train_ds = LiverUSDataset(config["csv_train"], transform=train_transform)
    val_ds = LiverUSDataset(config["csv_val"], transform=val_transform)

    train_loader = DataLoader(
        train_ds, batch_size=config["batch_size"], shuffle=True,
        num_workers=config["num_workers"], pin_memory=True
    )
    val_loader = DataLoader(
        val_ds, batch_size=config["batch_size"], shuffle=False,
        num_workers=config["num_workers"], pin_memory=True
    )

    logger.info(f"Train: {len(train_ds)}, Val: {len(val_ds)}")

    # Model
    model = build_model(num_classes=config["num_classes"]).to(device)

    # Class weights (для несбалансированных данных)
    class_counts = torch.bincount(torch.tensor(train_ds.df['class_id'].values))
    class_weights = (class_counts.sum() / (config["num_classes"] * class_counts.float())).to(device)
    logger.info(f"Class weights: {class_weights}")

    criterion = get_loss_function(class_weights)
    optimizer = get_optimizer(model, lr=config["lr"], weight_decay=config["weight_decay"])
    scheduler = get_scheduler(optimizer, config["epochs"], len(train_loader))
    scaler = GradScaler(enabled=config["use_amp"])

    # Resume
    start_epoch = 0
    best_f1 = 0.0
    if args.resume:
        ckpt = torch.load(args.resume, map_location=device)
        model.load_state_dict(ckpt["model_state"])
        optimizer.load_state_dict(ckpt["optimizer_state"])
        start_epoch = ckpt["epoch"] + 1
        best_f1 = ckpt.get("best_f1", 0.0)
        logger.info(f"Resumed from epoch {start_epoch}")

    save_dir = Path(config["save_dir"])
    save_dir.mkdir(parents=True, exist_ok=True)

    # Training loop
    patience_counter = 0
    for epoch in range(start_epoch, config["epochs"]):
        logger.info(f"\n=== Epoch {epoch+1}/{config['epochs']} ===")

        train_loss, train_acc, train_f1 = train_epoch(
            model, train_loader, criterion, optimizer, scaler, device, config["use_amp"]
        )
        val_loss, val_acc, val_f1 = validate(
            model, val_loader, criterion, device, config["use_amp"]
        )
        scheduler.step()

        logger.info(f"Train — Loss: {train_loss:.4f}, Acc: {train_acc:.4f}, F1: {train_f1:.4f}")
        logger.info(f"Val   — Loss: {val_loss:.4f}, Acc: {val_acc:.4f}, F1: {val_f1:.4f}")

        wandb.log({
            "epoch": epoch + 1,
            "train/loss": train_loss, "train/acc": train_acc, "train/f1": train_f1,
            "val/loss": val_loss, "val/acc": val_acc, "val/f1": val_f1,
            "lr": optimizer.param_groups[0]["lr"],
        })

        # Save best
        if val_f1 > best_f1:
            best_f1 = val_f1
            patience_counter = 0
            ckpt_path = save_dir / "liver_efficientnet_b3_best.pth"
            torch.save({
                "epoch": epoch,
                "model_state": model.state_dict(),
                "optimizer_state": optimizer.state_dict(),
                "best_f1": best_f1,
                "config": config,
            }, ckpt_path)
            logger.info(f"Saved best model: {ckpt_path} (F1={best_f1:.4f})")
        else:
            patience_counter += 1

        # Early stopping
        if patience_counter >= config["early_stopping_patience"]:
            logger.info(f"Early stopping at epoch {epoch+1}")
            break

        # Save last
        torch.save({
            "epoch": epoch,
            "model_state": model.state_dict(),
            "optimizer_state": optimizer.state_dict(),
        }, save_dir / "liver_efficientnet_b3_last.pth")

    logger.info(f"Training complete. Best F1: {best_f1:.4f}")
    wandb.finish()


if __name__ == "__main__":
    main()
```

### 2.3 config.yaml (адаптированный)

```yaml
# training/config.yaml
model: efficientnet_b3
num_classes: 4
input_size: 224
batch_size: 16        # RTX 5050 8GB: 16 при AMP, попробовать 24 если хватит VRAM
epochs: 50
lr: 0.001
weight_decay: 0.0001
label_smoothing: 0.1
early_stopping_patience: 10
num_workers: 4
seed: 42
use_amp: true
grad_clip: 1.0
save_dir: "../models/"
csv_train: "../data/processed/metadata_train.csv"
csv_val: "../data/processed/metadata_val.csv"
```

### 2.4 Команды запуска обучения

```bash
# 2.4.1 Проверить VRAM перед стартом
nvidia-smi
# Ожидаемо: ~8GB total, свободно >7GB

# 2.4.2 Установить зависимости (если ещё не)
cd services/ml-api
pip install -r requirements.txt
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install timm albumentations wandb scikit-learn pandas matplotlib seaborn

# 2.4.3 Дымовой тест (1 эпоха, маленький batch)
cd training
python train_efficientnet.py --config config.yaml 2>&1 | head -50
# Должно: загрузить модель, начать epoch 1/50 без OOM

# 2.4.4 Полный запуск (screen / tmux — обязательно, ~3-6 часов)
tmux new -s hepatotrain
python train_efficientnet.py --config config.yaml 2>&1 | tee ../models/train.log
# Ctrl+B, D — detach

# 2.4.5 Мониторинг (другой терминал)
tmux attach -t hepatotrain
# или:
tail -f services/ml-api/models/train.log
nvidia-smi dmon -s u -d 5  # GPU utilization every 5s
watch -n 5 nvidia-smi

# 2.4.6 Если OOM — уменьшить batch_size
# → edit config.yaml: batch_size: 8
# → Перезапуск

# 2.4.7 Если обучение прервалось — resume
python train_efficientnet.py --config config.yaml \
    --resume ../models/liver_efficientnet_b3_last.pth
```

### Оценка: 12–18ч

| Подзадача | Время |
|---|---|
| Адаптация model.py + optimizer | 1ч |
| Адаптация train.py (dataset, AMP, W&B) | 2ч |
| Первый запуск + дебаг OOM | 2–4ч |
| Полное обучение 50 epochs | 3–6ч (зависит от данных) |
| Подбор гиперпараметров (2-3 итерации) | 2–4ч |
| Дебаг nan loss, переобучение | 1–2ч |
| Resume после сбоев | 0.5–1ч |

### Blockers

| Риск | Вероятность | Митигация |
|---|---|---|
| OOM при batch_size=16 | Medium | Снизить до 8, gradient accumulation (effective batch 16) |
| NaN loss (AMP instability) | Medium | `torch.cuda.amp` → scale loss, check inf/nan |
| Переобучение (<500 изображений) | High | Dropout 0.3, weight decay 1e-3, heavy augmentation, early stopping |
| Медленное обучение (CPU bottleneck) | Low | `num_workers=4`, `pin_memory=True`, SSD для данных |
| timm не установлен / конфликт версий | Low | `pip install timm==1.0.0` |

---

## Фаза 3: Export ONNX + TorchScript (3–4ч)

### Цель
Экспортировать обученную модель в ONNX и TorchScript для production inference.

### 3.1 export_onnx.py (адаптировать из docs/training-code/)

```python
# training/export_onnx.py
#!/usr/bin/env python3
"""
Export trained EfficientNet to ONNX and TorchScript.
Input: 1x3x224x224 (batch, RGB, H, W)
Output: 1x4 (logits for 4 classes)
"""

import argparse
import torch
from model import build_model

CLASSES = ["Норма", "Гиперэхогенность", "Неоднородность", "Стеатоз/Фиброз"]
NUM_CLASSES = len(CLASSES)
INPUT_SIZE = 224


def export_onnx(checkpoint_path: str, output_path: str):
    model = build_model(num_classes=NUM_CLASSES, pretrained=False)
    ckpt = torch.load(checkpoint_path, map_location="cpu")
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    dummy_input = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)

    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=14,           # 14+ для Resize, хорошая совместимость
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {0: "batch_size"},
            "output": {0: "batch_size"},
        },
    )

    # Verify
    import onnxruntime as ort
    import numpy as np

    session = ort.InferenceSession(output_path)
    test_input = np.random.randn(1, 3, INPUT_SIZE, INPUT_SIZE).astype(np.float32)
    outputs = session.run(None, {"input": test_input})
    print(f"ONNX export OK. Output shape: {outputs[0].shape}")
    print(f"Output path: {output_path}")
    print(f"File size: {Path(output_path).stat().st_size / 1e6:.1f} MB")


def export_torchscript(checkpoint_path: str, output_path: str):
    model = build_model(num_classes=NUM_CLASSES, pretrained=False)
    ckpt = torch.load(checkpoint_path, map_location="cpu")
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    dummy_input = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)
    traced = torch.jit.trace(model, dummy_input)
    traced.save(output_path)

    # Verify
    loaded = torch.jit.load(output_path)
    test_output = loaded(dummy_input)
    print(f"TorchScript export OK. Output shape: {test_output.shape}")
    print(f"File size: {Path(output_path).stat().st_size / 1e6:.1f} MB")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True, help="Path to .pth checkpoint")
    parser.add_argument("--output_dir", default="../models/")
    parser.add_argument("--formats", nargs="+", choices=["onnx", "torchscript", "all"], default=["all"])
    args = parser.parse_args()

    from pathlib import Path
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    base_name = "liver_efficientnet_b3"

    if "onnx" in args.formats or "all" in args.formats:
        export_onnx(args.checkpoint, str(out_dir / f"{base_name}.onnx"))

    if "torchscript" in args.formats or "all" in args.formats:
        export_torchscript(args.checkpoint, str(out_dir / f"{base_name}.pt"))


if __name__ == "__main__":
    main()
```

### 3.2 Команды

```bash
# 3.2.1 Экспорт лучшей модели
cd services/ml-api/training
python export_onnx.py \
    --checkpoint ../models/liver_efficientnet_b3_best.pth \
    --output_dir ../models/ \
    --formats all

# 3.2.2 Ожидаемый результат
# ONNX:  ~17 MB  (FP32)
# TorchScript: ~17 MB
# Сравнить размеры:
ls -lh ../models/liver_efficientnet_b3*

# 3.2.3 Оптимизация: FP16 ONNX (меньше размер, быстрее inference)
# Установка:
pip install onnx onnxoptimizer

# Конвертация в FP16:
python -c "
import onnx
from onnxconverter_common import float16
model = onnx.load('../models/liver_efficientnet_b3.onnx')
model_fp16 = float16.convert_float_to_float16(model)
onnx.save(model_fp16, '../models/liver_efficientnet_b3_fp16.onnx')
print('FP16 model saved')
"
# FP16: ~8.5 MB

# 3.2.4 Проверить, что ONNX Runtime загружает
python -c "
import onnxruntime as ort
import numpy as np
sess = ort.InferenceSession('../models/liver_efficientnet_b3.onnx')
out = sess.run(None, {'input': np.random.randn(1,3,224,224).astype(np.float32)})
print('ONNX Runtime OK, output shape:', out[0].shape)
"
```

### Ожидаемые размеры

| Формат | Размер | Время загрузки | Провайдеры |
|---|---|---|---|
| .pth (state_dict) | ~17 MB | ~0.5s | PyTorch |
| .onnx (FP32) | ~17 MB | ~0.3s | ONNX Runtime (CUDA/CPU) |
| .onnx (FP16) | ~8.5 MB | ~0.2s | ONNX Runtime (CUDA) |
| .pt (TorchScript) | ~17 MB | ~0.4s | PyTorch |

### Оценка: 3–4ч

| Подзадача | Время |
|---|---|
| Адаптация export скрипта | 1ч |
| Экспорт + проверка | 0.5ч |
| FP16 конвертация (опционально) | 1ч |
| Дебаг несовместимости ops | 0.5–1.5ч |

### Blockers

| Риск | Вероятность | Митигация |
|---|---|---|
| `torch.onnx.export` падает на dynamic_axes | Low | Убрать dynamic_axes для статического batch |
| Opset 14 не поддерживается inference runtime | Low | Снизить до opset 11 или 13 |
| FP16 даёт NaN на некоторых входах | Medium | Тестировать на реальных изображениях перед FP16 |

---

## Фаза 4: inference.py — реальная загрузка (6–8ч)

### Цель
Заменить `_vision_stub` на inference через реальную модель (ONNX или PyTorch) + Grad-CAM для explainability.

### 4.1 Адаптация inference.py

```python
# services/ml-api/app/inference.py
"""
Inference pipeline: ONNX/PyTorch model + optional Grad-CAM.
Backward-compatible: run_inference() signature unchanged.
"""

import io
import hashlib
import logging
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

from app.model_loader import (
    is_stub_mode, get_onnx_session, get_torch_model, get_device,
    CLASSES, NUM_CLASSES,
)

logger = logging.getLogger(__name__)

# ─── Preprocessing constants ────────────────────────────────────────────
INPUT_SIZE = 224
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406])
IMAGENET_STD = np.array([0.229, 0.224, 0.225])


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """
    PIL bytes → preprocessed numpy array [1, 3, 224, 224].
    Grayscale УЗИ → RGB → resize → normalize.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("L").convert("RGB")
    img = img.resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR)
    arr = np.array(img).astype(np.float32) / 255.0  # [H, W, 3]

    # Normalize
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    arr = np.transpose(arr, (2, 0, 1))  # [3, H, W]
    arr = np.expand_dims(arr, axis=0)    # [1, 3, H, W]
    return arr


def _onnx_inference(image_bytes: bytes) -> tuple[str, float]:
    """Inference через ONNX Runtime."""
    session = get_onnx_session()
    input_arr = preprocess_image(image_bytes)

    outputs = session.run(None, {"input": input_arr})
    logits = outputs[0][0]  # [num_classes]

    probs = _softmax(logits)
    pred_idx = int(np.argmax(probs))
    confidence = float(probs[pred_idx])

    return CLASSES[pred_idx], round(confidence, 4)


def _torch_inference(image_bytes: bytes) -> tuple[str, float]:
    """Inference через PyTorch / TorchScript."""
    import torch
    model = get_torch_model()
    device = get_device()

    input_arr = preprocess_image(image_bytes)
    input_tensor = torch.from_numpy(input_arr).to(device)

    with torch.no_grad():
        output = model(input_tensor)
        logits = output[0].cpu().numpy()

    probs = _softmax(logits)
    pred_idx = int(np.argmax(probs))
    confidence = float(probs[pred_idx])

    return CLASSES[pred_idx], round(confidence, 4)


def _softmax(x: np.ndarray) -> np.ndarray:
    exp_x = np.exp(x - np.max(x))
    return exp_x / exp_x.sum()


def _vision_stub(image_bytes: bytes) -> tuple[str, float]:
    """Legacy hash-based stub. Fallback mode."""
    digest = hashlib.sha256(image_bytes).hexdigest()
    bucket = int(digest[:8], 16) % 100
    if bucket < 25:
        return "Норма", 0.72
    if bucket < 55:
        return "Гиперэхогенность паренхимы", 0.81
    if bucket < 80:
        return "Неоднородная эхоструктура", 0.87
    return "Признаки стеатоза / фиброза", 0.91


# ─── Grad-CAM ───────────────────────────────────────────────────────────
def generate_gradcam(image_bytes: bytes, target_layer: str = "conv_head") -> Optional[bytes]:
    """
    Генерация Grad-CAM heatmap.
    Returns: PNG bytes или None если stub mode / ONNX (только PyTorch).
    """
    if is_stub_mode() or get_onnx_session() is not None:
        # Grad-CAM требует PyTorch backward hooks
        # ONNX → можно через onnxruntime, но сложнее
        logger.warning("Grad-CAM only available for PyTorch model")
        return None

    try:
        from pytorch_grad_cam import GradCAM
        from pytorch_grad_cam.utils.image import show_cam_on_image
        import torch

        model = get_torch_model()
        device = get_device()

        # Найти target layer
        target_layers = [dict(model.named_modules())[target_layer]]

        # Preprocess
        input_arr = preprocess_image(image_bytes)
        input_tensor = torch.from_numpy(input_arr).to(device)

        # GradCAM
        cam = GradCAM(model=model, target_layers=target_layers)
        grayscale_cam = cam(input_tensor=input_tensor)
        grayscale_cam = grayscale_cam[0, :]

        # Overlay на оригинальное изображение
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = img.resize((INPUT_SIZE, INPUT_SIZE))
        img_arr = np.array(img).astype(np.float32) / 255.0

        visualization = show_cam_on_image(img_arr, grayscale_cam, use_rgb=True)

        # → PNG bytes
        result_img = Image.fromarray((visualization * 255).astype(np.uint8))
        buf = io.BytesIO()
        result_img.save(buf, format="PNG")
        return buf.getvalue()

    except Exception as e:
        logger.error(f"Grad-CAM generation failed: {e}")
        return None


# ─── Public API ─────────────────────────────────────────────────────────
def run_inference(image_bytes: bytes, use_gradcam: bool = False) -> dict:
    """
    Main inference entry point.
    Returns: {"diagnosis": str, "confidence": float, "gradcam": bytes | None}
    """
    if is_stub_mode():
        diagnosis, confidence = _vision_stub(image_bytes)
        logger.warning("Running in STUB mode — no real model loaded")
    elif get_onnx_session() is not None:
        diagnosis, confidence = _onnx_inference(image_bytes)
    elif get_torch_model() is not None:
        diagnosis, confidence = _torch_inference(image_bytes)
    else:
        diagnosis, confidence = _vision_stub(image_bytes)

    gradcam_bytes = None
    if use_gradcam:
        gradcam_bytes = generate_gradcam(image_bytes)

    return {
        "diagnosis": diagnosis,
        "confidence": confidence,
        "gradcam": gradcam_bytes,
        "stub_mode": is_stub_mode(),
    }
```

### 4.2 Обновление requirements.txt

```txt
# services/ml-api/requirements.txt
fastapi==0.115.6
uvicorn[standard]==0.34.0
python-multipart==0.0.20
pydantic==2.10.4
pillow==11.1.0
numpy==2.2.1
pytest==8.3.4
httpx==0.28.1

# ─── ML Inference ───────────────────────────────────────────────────────
torch>=2.1.0           # PyTorch — CPU/CUDA
torchvision>=0.16.0    # transforms
onnxruntime-gpu>=1.16  # ONNX Runtime с CUDA support
opencv-python>=4.8     # image utilities
pytorch-grad-cam>=1.4  # Grad-CAM explanations
timm>=1.0.0            # EfficientNet backbone
```

### 4.3 Обновление main.py (endpoint для Grad-CAM)

```python
# services/ml-api/app/main.py — добавить endpoint
from fastapi import UploadFile, File, Query
from fastapi.responses import StreamingResponse
from app.inference import run_inference, generate_gradcam

@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    gradcam: bool = Query(False, description="Include Grad-CAM visualization")
):
    """Run vision inference on uploaded ultrasound image."""
    image_bytes = await file.read()
    result = run_inference(image_bytes, use_gradcam=gradcam)

    response = {
        "diagnosis": result["diagnosis"],
        "confidence": result["confidence"],
        "model_loaded": not result["stub_mode"],
    }

    if gradcam and result["gradcam"] is not None:
        response["gradcam"] = StreamingResponse(
            io.BytesIO(result["gradcam"]), media_type="image/png"
        )

    return response
```

### 4.4 Команды

```bash
# 4.4.1 Установить обновлённые зависимости
cd services/ml-api
pip install -r requirements.txt

# 4.4.2 Положить модель в models/
cp models/liver_efficientnet_b3.onnx models/liver_efficientnet_b3.onnx
# или:
cp models/liver_efficientnet_b3_best.pth models/liver_efficientnet_b3.pth

# 4.4.3 Запустить ML API
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0

# 4.4.4 Тест: stub mode
curl -X POST "http://localhost:8000/predict" \
    -F "file=@test_image.jpg"
# → {"diagnosis": "Норма", "confidence": 0.72, "model_loaded": false}

# 4.4.5 Тест: реальная модель
curl -X POST "http://localhost:8000/predict" \
    -F "file=@real_us_image.jpg"
# → {"diagnosis": "Признаки стеатоза / фиброза", "confidence": 0.93, "model_loaded": true}

# 4.4.6 Тест: с Grad-CAM
curl -X POST "http://localhost:8000/predict?gradcam=true" \
    -F "file=@real_us_image.jpg" \
    --output result_with_gradcam.png

# 4.4.7 Тест: интеграция с triage.py
curl -X POST "http://localhost:8000/api/v1/screen" \
    -H "Content-Type: application/json" \
    -d '{
        "age": 45, "ast": 55, "alt": 68, "platelets": 180,
        "has_hbv": false, "image": "<base64_image>"
    }'
```

### Оценка: 6–8ч

| Подзадача | Время |
|---|---|
| Рефакторинг inference.py (ONNX + PyTorch paths) | 2ч |
| Интеграция model_loader + lifespan | 1ч |
| Grad-CAM + endpoint | 1.5ч |
| Дебаг preprocessing (resize, normalize) | 1ч |
| Интеграция с triage.py | 0.5ч |

### Blockers

| Риск | Вероятность | Митигация |
|---|---|---|
| ONNX Runtime падает при загрузке CUDA provider | Medium | Fallback на CPUExecutionProvider |
| Preprocessing mismatch (train vs inference) | Medium | Сверить pipeline: тот же resize, mean, std |
| Grad-CAM требует GPU memory | Low | Сделать опциональным, выгружать после use |
| Docker image слишком большой (+torch) | Medium | Многоэтапная сборка, только CPU torch в production |

---

## Фаза 5: Eval Notebook + Pitch Report (4–6ч)

### Цель
Оценить модель на тестовой выборке, построить ROC, confusion matrix, сравнить с FIB-4 baseline. Подготовить отчёт для питча.

### 5.1 eval.ipynb

```python
# notebooks/eval.ipynb — key cells

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Cell 1: Setup                                                          ║
# ╚══════════════════════════════════════════════════════════════════════════╝
import torch
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import (
    roc_curve, auc, confusion_matrix, classification_report,
    precision_recall_curve, average_precision_score, calibration_curve
)
from sklearn.preprocessing import label_binarize
import sys; sys.path.append("..")
from training.model import build_model
from training.dataset import LiverUSDataset, val_transform

CLASSES = ["Норма", "Гиперэхогенность", "Неоднородность", "Стеатоз/Фиброз"]
NUM_CLASSES = len(CLASSES)

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Cell 2: Load model + test data                                         ║
# ╚══════════════════════════════════════════════════════════════════════════╝
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model = build_model(num_classes=NUM_CLASSES, pretrained=False)
ckpt = torch.load("../models/liver_efficientnet_b3_best.pth", map_location=device)
model.load_state_dict(ckpt["model_state"])
model.to(device).eval()

# Test dataset
test_df = pd.read_csv("../data/processed/metadata_test.csv")
print(f"Test set: {len(test_df)} samples")
print(test_df['class_id'].value_counts().sort_index())

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Cell 3: Inference on test set                                          ║
# ╚══════════════════════════════════════════════════════════════════════════╝
from torch.utils.data import DataLoader

test_ds = LiverUSDataset("../data/processed/metadata_test.csv", transform=val_transform)
test_loader = DataLoader(test_ds, batch_size=16, shuffle=False)

all_labels = []
all_probs = []
all_preds = []

with torch.no_grad():
    for images, labels in test_loader:
        images = images.to(device)
        outputs = model(images)
        probs = torch.softmax(outputs, dim=1).cpu().numpy()
        preds = outputs.argmax(dim=1).cpu().numpy()

        all_labels.extend(labels.numpy())
        all_probs.extend(probs)
        all_preds.extend(preds)

all_labels = np.array(all_labels)
all_probs = np.array(all_probs)
all_preds = np.array(all_preds)

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Cell 4: Confusion Matrix                                               ║
# ╚══════════════════════════════════════════════════════════════════════════╝
cm = confusion_matrix(all_labels, all_preds)
plt.figure(figsize=(8, 6))
sns.heatmap(cm, annot=True, fmt="d", xticklabels=CLASSES, yticklabels=CLASSES, cmap="Blues")
plt.title("Confusion Matrix — EfficientNet-B3 (Liver US)")
plt.ylabel("True")
plt.xlabel("Predicted")
plt.tight_layout()
plt.savefig("../docs/metrics/confusion_matrix.png", dpi=150)
plt.show()

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Cell 5: ROC Curves (One-vs-Rest)                                       ║
# ╚══════════════════════════════════════════════════════════════════════════╝
labels_binarized = label_binarize(all_labels, classes=range(NUM_CLASSES))

plt.figure(figsize=(10, 8))
for i, cls_name in enumerate(CLASSES):
    fpr, tpr, _ = roc_curve(labels_binarized[:, i], all_probs[:, i])
    roc_auc = auc(fpr, tpr)
    plt.plot(fpr, tpr, label=f"{cls_name} (AUC = {roc_auc:.3f})")

plt.plot([0, 1], [0, 1], "k--", label="Random")
plt.xlabel("False Positive Rate")
plt.ylabel("True Positive Rate")
plt.title("ROC Curves — Liver Ultrasound Classification")
plt.legend(loc="lower right")
plt.tight_layout()
plt.savefig("../docs/metrics/roc_curves.png", dpi=150)
plt.show()

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Cell 6: Calibration Plot                                               ║
# ╚══════════════════════════════════════════════════════════════════════════╝
plt.figure(figsize=(10, 8))
for i, cls_name in enumerate(CLASSES):
    prob_true, prob_pred = calibration_curve(labels_binarized[:, i], all_probs[:, i], n_bins=10)
    plt.plot(prob_pred, prob_true, "s-", label=cls_name)

plt.plot([0, 1], [0, 1], "k--", label="Perfectly calibrated")
plt.xlabel("Mean Predicted Probability")
plt.ylabel("Fraction of Positives")
plt.title("Calibration Plot")
plt.legend()
plt.tight_layout()
plt.savefig("../docs/metrics/calibration.png", dpi=150)
plt.show()

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Cell 7: Classification Report                                          ║
# ╚══════════════════════════════════════════════════════════════════════════╝
print(classification_report(all_labels, all_preds, target_names=CLASSES))

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Cell 8: FIB-4 Baseline Comparison                                      ║
# ╚══════════════════════════════════════════════════════════════════════════╝
# FIB-4: (age × AST) / (platelets × √ALT)
# Классификация: <1.45 = F0-F1 (норма), 1.45-3.25 = F2 (значимый фиброз), >3.25 = F3-F4

# Загрузить клинические данные для test set
test_clinical = pd.read_csv("../data/processed/metadata_test.csv")
test_clinical['fib4'] = (test_clinical['age'] * test_clinical['ast']) / \
                        (test_clinical['platelets'] * np.sqrt(test_clinical['alt']))

# FIB-4 → бинарный: значимый фиброз (F2+)
test_clinical['fib4_binary'] = (test_clinical['fib4'] >= 1.45).astype(int)

# Сравнение: бинарная классификация (норма vs патология)
binary_true = (all_labels > 0).astype(int)  # 0 = норма, 1+ = патология
binary_pred_fib4 = test_clinical['fib4_binary'].values

from sklearn.metrics import accuracy_score, f1_score as sk_f1
print(f"FIB-4 baseline accuracy: {accuracy_score(binary_true, binary_pred_fib4):.3f}")
print(f"FIB-4 baseline F1:       {sk_f1(binary_true, binary_pred_fib4):.3f}")

# Наша модель: бинарный предикт
binary_pred_model = (all_preds > 0).astype(int)
print(f"EfficientNet accuracy:   {accuracy_score(binary_true, binary_pred_model):.3f}")
print(f"EfficientNet F1:         {sk_f1(binary_true, binary_pred_model):.3f}")

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Cell 9: Metrics Summary for Pitch                                      ║
# ╚══════════════════════════════════════════════════════════════════════════╝
from sklearn.metrics import balanced_accuracy_score, cohen_kappa_score

print("=" * 60)
print("HepatoScreen Vision Model — Test Set Metrics")
print("=" * 60)
print(f"Model:        EfficientNet-B3 ( ImageNet pretrained)")
print(f"Classes:      {NUM_CLASSES}")
print(f"Test samples: {len(all_labels)}")
print(f"Balanced Accuracy: {balanced_accuracy_score(all_labels, all_preds):.4f}")
print(f"Cohen Kappa:       {cohen_kappa_score(all_labels, all_preds):.4f}")
print(f"Weighted F1:       {sk_f1(all_labels, all_preds, average='weighted'):.4f}")
print("-" * 60)
print("Per-class metrics:")
for i, cls in enumerate(CLASSES):
    cls_mask = all_labels == i
    if cls_mask.sum() > 0:
        cls_acc = (all_preds[cls_mask] == i).mean()
        print(f"  {cls}: accuracy = {cls_acc:.3f}, n = {cls_mask.sum()}")
print("=" * 60)
```

### 5.2 Команды

```bash
# 5.2.1 Создать директорию для метрик
mkdir -p services/ml-api/docs/metrics

# 5.2.2 Запустить notebook
cd services/ml-api
jupyter notebook notebooks/eval.ipynb
# → Run all cells
# → Сохранить outputs: confusion_matrix.png, roc_curves.png, calibration.png

# 5.2.3 Экспорт отчёта
jupyter nbconvert --to html notebooks/eval.ipynb --output ../docs/metrics/eval_report.html
```

### 5.3 Pitch-отчёт (документ)

```bash
# 5.3.1 Создать pitch-документ
cat > services/ml-api/docs/metrics/PITCH_METRICS.md << 'EOF'
# HepatoScreen — ML Metrics Summary

## Модель
- **Architecture:** EfficientNet-B3 (pretrained on ImageNet)
- **Input:** 224×224 RGB (grayscale US duplicated to 3 channels)
- **Classes:** 4 (Норма, Гиперэхогенность, Неоднородность, Стеатоз/Фиброз)
- **Training:** 50 epochs, AdamW, mixed precision (AMP), CosineAnnealing
- **Hardware:** RTX 5050 Laptop, ~8GB VRAM

## Метрики на тестовой выборке
| Metric | Value |
|---|---|
| Balanced Accuracy | TBD |
| Weighted F1 | TBD |
| Cohen Kappa | TBD |
| AUC (macro) | TBD |

## Сравнение с FIB-4 (baseline)
| Model | Binary Accuracy | Binary F1 |
|---|---|---|
| FIB-4 (≥1.45) | TBD | TBD |
| EfficientNet-B3 | TBD | TBD |

## Инференс
| Format | Size | Latency (GPU) |
|---|---|---|
| ONNX FP32 | ~17 MB | ~15ms |
| ONNX FP16 | ~8.5 MB | ~10ms |

## Grad-CAM
- Explainability для каждого предсказания
- Подсветка патологических зон на УЗИ

## Следующие шаги
1. [ ] Сбор больше данных (>2000 изображений)
2. [ ] Клиническая валидация (ретроспективное исследование)
3. [ ] Регуляторное одобрение (Минздрав РК)
4. [ ] Развёртывание в ПМСП-пилоте
EOF
```

### Оценка: 4–6ч

| Подзадача | Время |
|---|---|
| Написание eval.ipynb | 1.5ч |
| Запуск + дебаг | 1ч |
| ROC + confusion + calibration | 1ч |
| Сравнение с FIB-4 | 0.5ч |
| Pitch-отчёт | 0.5–1ч |

### Blockers

| Риск | Вероятность | Митигация |
|---|---|---|
| Тестовая выборка слишком мала (<50) | Medium | Использовать cross-validation на всём датасете |
| Метрики хуже FIB-4 | Medium | Фокус на 4-классной классификации (FIB-4 бинарный), искать niches |
| Нет клинических данных для test set | Medium | Использовать только vision-метрики |

---

## Timeline (итоговый)

```
День 1 (8-10ч)
├── Фаза 0: Структура репо, model_loader.py, lifespan [2ч]
├── Фаза 1: Экспорт данных, EDA, merge датасетов, dataset.py [6-8ч]
└── Остаток: дымовой тест загрузки данных

День 2 (8-12ч)
├── Фаза 2: model.py, train.py, запуск обучения [4ч]
├── Обучение 50 epochs (параллельно, GPU занят) [3-6ч]
└── Мониторинг, подбор гиперпараметров [1-2ч]

День 3 (6-10ч)
├── Фаза 3: ONNX export, проверка [2ч]
├── Фаза 4: inference.py, model_loader integration [4ч]
├── Тестирование end-to-end [2ч]
└── Фаза 5: eval notebook, pitch report [2-4ч]

Итого: 3 дня при полной занятости
или: 5-7 дней при 4-6ч/день
```

---

## Критический путь (Critical Path)

```
[Фаза 1: Данные] → [Фаза 2: Обучение] → [Фаза 3: Export] → [Фаза 4: Integration]
     ↑                                             ↓
     └────── [Фаза 5: Eval] ←────────────────────┘
```

**Самый долгий путь:** Фаза 1 → Фаза 2 → Фаза 4 = **24–36ч**

**Parallelizable:**
- Фаза 0 может идти параллельно с Фазой 1
- Фаза 3 запускается сразу после лучшего чекпоинта (не ждать 50 epochs)
- Фаза 5 — после Фазы 4

---

## Docker Integration

### Dockerfile (многоэтапная сборка)

```dockerfile
# services/ml-api/Dockerfile
# ─── Stage 1: Build (torch not needed) ──────────────────────────────────
FROM python:3.11-slim as builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ─── Stage 2: Runtime ───────────────────────────────────────────────────
FROM python:3.11-slim

# Copy installed packages
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

WORKDIR /app
COPY app/ ./app/
COPY models/ ./models/
COPY training/ ./training/

# Note: для GPU-инференса нужен базовый image с CUDA
# nvidia/cuda:12.1-runtime-ubuntu22.04 + python установить

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
# Сборка
docker build -t hepatoscreen-ml-api services/ml-api/

# Запуск (CPU)
docker run -p 8000:8000 hepatoscreen-ml-api

# Запуск (GPU)
docker run --gpus all -p 8000:8000 hepatoscreen-ml-api
```

---

## CI/CD (GitHub Actions)

```yaml
# .github/workflows/ml-api.yml
name: ML API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd services/ml-api
          pip install -r requirements.txt

      - name: Run tests
        run: |
          cd services/ml-api
          pytest tests/ -v

      - name: Lint
        run: |
          pip install ruff
          ruff check app/
```

---

## Чек-лист завершения

- [ ] Фаза 0: `model_loader.py` создан, lifespan работает, stub fallback есть
- [ ] Фаза 1: `metadata.csv` с >500 изображениями, 4 класса, train/val/test split
- [ ] Фаза 2: `liver_efficientnet_b3_best.pth` с F1 > 0.7 на val
- [ ] Фаза 3: `liver_efficientnet_b3.onnx` экспортирован и проверен
- [ ] Фаза 4: `/predict` возвращает реальный diagnosis, не stub
- [ ] Фаза 5: `eval.ipynb` с ROC, confusion matrix, сравнение с FIB-4
- [ ] Pitch: `PITCH_METRICS.md` заполнен реальными числами

---

## Приложение A: Альтернативы при недостатке данных

Если собрать <300 изображений не удаётся:

| Стратегия | Реализация | Время |
|---|---|---|
| **Transfer learning + heavy aug** | Albumentations: elastic, grid distortion, cutout | 2ч |
| **Few-shot learning** | Prototypical Networks / Matching Networks | 4ч |
| **Self-supervised pretraining** | SimCLR на УЗИ без разметки, затем fine-tune | 8ч |
| **Synthetic data (GAN)** | StyleGAN2-ADA для генерации УЗИ | 12ч+ |
| **External API fallback** | Интеграция с готовым сервисом (temp) | 2ч |

**Рекомендация:** Начать с heavy augmentation + transfer learning. Это даст 70%+ результата за 2ч.

---

## Приложение B: PHI / Деидентификация

HepatoScreen работает с медицинскими данными Казахстана. Требования:

```python
# Проверка перед commit
def check_phi_in_csv(filepath):
    """Сканирует CSV на признаки PHI."""
    import re
    phi_patterns = [
        r'\b\d{12}\b',           # ИИН (12 цифр)
        r'\b[A-Z]{2}\d{7}\b',    # Номер паспорта
        r'\+7\d{10}',             # Телефон
        r'[\w.-]+@[\w.-]+\.\w+',  # Email
    ]
    df = pd.read_csv(filepath)
    for col in df.columns:
        for pattern in phi_patterns:
            matches = df[col].astype(str).str.extractall(pattern)
            if not matches.empty:
                raise ValueError(f"PHI detected in column '{col}': {matches.head()}")
    print("No PHI detected.")
```

- `data/raw/` — в `.gitignore`, не коммитить
- `cases.csv` из export — сканировать на PHI перед коммитом
- Модели (`.pth`, `.onnx`) — не содержат PHI, но весомые → Git LFS или артефакты

---

*Документ составлен: AI_BUILD_PLAN.md v1.0*
*Следующее обновление: после Фазы 2 (заполнить реальные метрики)*
