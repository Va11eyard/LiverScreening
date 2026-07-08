# HepatoScreen — План подготовки документов для хакатона

## Цель
Подготовить 7 markdown-документов (Blocks A-G) для коммита в репозиторий HepatoScreen перед хакатоном. Swarm: исследование, идеи, ТЗ и план — НЕ писать production-код.

## Архитектура репозитория (контекст для всех агентов)
- apps/web — Next.js + shadcn, :3004 — клиника (кейсы, регистр, экспорт)
- apps/ml-lab — Vite React, :3005 — загрузка УЗИ, тест модели, explainability
- services/ml-api — FastAPI: triage.py (FIB-4/APRI/fusion), inference.py (stub vision), explanations.py, main.py
- Go API :8088 + PostgreSQL — авторизация, кейсы, изображения, отчёты
- Текущий inference.py использует hash-based stub (не реальная модель)
- docs/ (gitignored) — архив retinopathy: training-code (EfficientNet), старый pipeline
- GPU: RTX 5050 Laptop, PyTorch (позже)

## Стадии

### Stage 1 — Параллельное написание 7 документов (все независимы)
Каждый агент получает полный контекст репо + специфическое задание.

| Агент | Документ | Тема |
|-------|----------|------|
| ideas_writer | IDEAS.md | Блок A — идеи и дифференциация |
| ai_strategy_writer | AI_STRATEGY.md | Блок B — стратегия своего ИИ (3 модуля) |
| ai_build_writer | AI_BUILD_PLAN.md | Блок C — план создания ИИ (фазы 0-5) |
| architecture_writer | ARCHITECTURE.md | Блок D — архитектура системы |
| ml_lab_design_writer | ML_LAB_DESIGN.md | Блок E — дизайн ML Lab |
| pitch_writer | PITCH.md | Блок F — питч (8 слайдов) |
| dataset_writer | DATASET.md | Блок G — датасеты |

### Stage 2 — Валидация и финализация
- Проверить что все 7 файлов написаны
- Убедиться в консистентности (одинаковые термины, ссылки между документами)
- Выдать файлы пользователю

## Критерии качества
- Конкретика: цифры, пороги, имена моделей, команды, ссылки
- Язык: русский (ML-термины на английском)
- Тон: хакатонный прототип, но мышление как medical AI product
- Ссылки между документами: AI_STRATEGY → AI_BUILD_PLAN, ARCHITECTURE → ML_LAB_DESIGN
