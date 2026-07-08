# LiverScreening (HepatoScreen)

Прототип скрининга патологий печени и ХВГ для ПМСП — **три отдельных контура**:

| Сервис | Порт | Назначение |
|--------|------|------------|
| **HepatoScreen** (`apps/web`) | 3004 | Клиника: кейсы, регистр, экспорт датасета |
| **ML Lab** (`apps/ml-lab`) | 3005 | Загрузка УЗИ, тест модели, анимация explainability |
| **ML API** (`services/ml-api`) | 8000 | FIB-4, APRI, inference (общий backend для обоих UI) |
| **Go API** | 8088 | Авторизация, кейсы, изображения, отчёты |

## Быстрый старт

**Бэкенды (Docker):**

```powershell
copy .env.example .env
docker compose up -d --build
```

**Фронтенды (локально, hot reload):**

```powershell
pnpm install
pnpm dev
```

| Команда | Порт | Приложение |
|---------|------|------------|
| `pnpm dev` | 3004 + 3005 | Оба фронта параллельно |
| `pnpm dev:web` | 3004 | HepatoScreen (клиника) |
| `pnpm dev:ml-lab` | 3005 | ML Lab (тест модели) |

Или одной командой: `.\deploy\dev-web.ps1` (Docker + `pnpm dev`).

- Клиническая платформа: http://localhost:3004  
- ML Lab: http://localhost:3005  
- Go API: http://localhost:8088  
- ML API docs: http://localhost:8000/docs  

**Логин (только платформа):** `coordinator@liver.kz` / `ChangeMe123!`

Перед первым `pnpm dev:web` скопируйте `apps/web/.env.local.example` → `apps/web/.env.local`.  
Для ML Lab: `apps/ml-lab/.env.example` → `apps/ml-lab/.env`.

## Обучение модели (RTX 5050, CUDA 12.8)

```powershell
cd services\ml-api
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt -r requirements-train.txt
.\.venv\Scripts\pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
.\.venv\Scripts\python training\download_datasets.py
.\.venv\Scripts\python training\merge_datasets.py
cd training
..\.venv\Scripts\python train_efficientnet.py
..\.venv\Scripts\python export_onnx.py
..\.venv\Scripts\python eval_model.py
```

Веса: `services/ml-api/models/liver_efficientnet_b3_best.pth` (gitignored).  
Документация Kimi: `docs/hepatoscreen/`

## Тесты ML API

```powershell
cd services\ml-api
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\pytest tests/ -v
```

## Архив

`docs/` — retinopathy pipeline (gitignored): `retinapathy-app`, `training-code` (PyTorch / RTX 5050 — позже).

## Дисклеймер

Исследовательский прототип хакатона. Не для клинического применения без валидации.
