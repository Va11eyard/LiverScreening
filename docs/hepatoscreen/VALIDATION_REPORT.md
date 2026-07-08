# Валидация HepatoScreen Docs

> Дата проверки: 2025-01-19 | 7 документов | 35 проверок

---

## 1. Терминология

| Термин | Статус | Примечание |
|--------|--------|------------|
| **Название проекта** | OK | "HepatoScreen" во всех 7 документах |
| **risk_tier значения** | CRITICAL | IDEAS/AI_STRATEGY: `low/watch/urgent/refer_hepatology`; ML_LAB_DESIGN: `low/moderate/high/critical` — разные enum'ы! ARCHITECTURE response examples использует `"risk_level": "high"` — третий вариант. |
| **FIB-4 пороги** | OK | 1.3 (watch), 1.45 (urgent), 3.25 (refer_hepatology) — консистентно в IDEAS, AI_STRATEGY, AI_BUILD_PLAN |
| **APRI пороги** | OK | 0.7 (watch), 1.5 (urgent), 2.0 (refer_hepatology) — консистентно в IDEAS, AI_STRATEGY |
| **Порты** | OK | web :3004, ml-lab :3005, ml-api :8000, Go API :8088 — во всех документах |
| **GPU** | OK | RTX 5050 Laptop ~8GB VRAM — во всех 7 документах |
| **FIB-4 формула** | OK | `(age * AST) / (platelets * sqrt(ALT))` — идентична везде |
| **APRI формула** | OK | `((AST/40) * 100) / platelets` — идентична везде |

---

## 2. Ссылки между документами

| Проверка | Статус | Примечание |
|----------|--------|------------|
| **AI_STRATEGY → AI_BUILD_PLAN (фазы)** | CRITICAL | Два документа используют фазы 0-5 с **разным содержанием**. AI_STRATEGY Phase 0 = "Подготовка (1-2 нед)", AI_BUILD_PLAN Phase 0 = "Стабилизация stub (2ч)". AI_STRATEGY Phase 2 = "EfficientNet-B3 Training", AI_BUILD_PLAN Phase 2 = "Training EfficientNet-B0". Конфликт нумерации — читатель запутается. |
| **AI_BUILD_PLAN → файлы репо** | OK | Пути (`services/ml-api/app/`, `training/`, `models/`) соответствуют структуре репо. Предлагает создать `training/`, `data/`, `notebooks/` — не конфликтует с существующей структурой. |
| **ARCHITECTURE → другие документы** | OK | 3 контура (web/ml-lab/ml-api) совпадают с AI_STRATEGY (3 модуля). Порты, стек, auth-flow консистентны. |
| **ML_LAB_DESIGN → ARCHITECTURE** | OK | ML Lab описывается как Vite+React на :3005, обращается к ML API :8000 — совпадает с ARCHITECTURE. Использует shadcn/ui для выравнивания с apps/web. |
| **PITCH → IDEAS (roadmap)** | OK | 6 пилотных учреждений, $80K ask, 12-месячный roadmap — согласованы. |
| **PITCH → IDEAS (метрики AUC)** | WARNING | PITCH: "AUC > 0.85"; IDEAS фаза 2: "AUC-ROC >= 0.88" — разные целевые значения. |
| **DATASET.md → AI_STRATEGY** | WARNING | DATASET.md упоминает Saudi NAFLD (10K), BEHSOF, Byra, AUL — этих датасетов нет в AI_STRATEGY. AI_STRATEGY упоминает "Mendeley NAFLD", "LiverBoost/HBV-US" — этих нет в DATASET.md. Разные списки ключевых датасетов. |

---

## 3. Техническая консистентность

| Проверка | Статус | Примечание |
|----------|--------|------------|
| **Модель (EfficientNet версия)** | CRITICAL | IDEAS.md: **EfficientNet-B4** (x2). AI_STRATEGY.md: **EfficientNet-B3** (primary). AI_BUILD_PLAN.md: **EfficientNet-B0** (весь план обучения). PITCH.md: **EfficientNet-B3**. DATASET.md: "B0/B3". Четыре разных версии в пяти документах! |
| **Fusion веса** | CRITICAL | IDEAS.md (1.2): "вес клинического скора = 0.4, вес vision model = 0.6". AI_STRATEGY.md (2.2.4): W_FIB4=0.35 + W_APRI=0.25 + W_AST_ALT=0.10 = **clinical 0.7**, W_VISION=0.30 = **vision 0.3**. Противоположные веса! |
| **GPU** | OK | RTX 5050 Laptop ~8GB VRAM — во всех документах |
| **JSON контракт backward compat** | OK | AI_STRATEGY.md определяет v2.0 schema с explicit backward compatibility mapping. AI_BUILD_PLAN.md: "run_inference() signature unchanged". |
| **Inference latency** | WARNING | IDEAS.md: "< 2.5 сек на GPU, < 8 сек на CPU" (end-to-end). AI_STRATEGY.md: "~75 ms" (vision-only forward). Разные контексты, но читатель может запутаться. |
| **INPUT_SIZE** | WARNING | AI_BUILD_PLAN.md: 224x224 (везде). AI_STRATEGY.md: 512x512 (стр 182, 503). DATASET.md: "224x224 или 384x384" (стр 233). Три разных размера! |
| **Training time** | OK | IDEAS: 6 часов; AI_STRATEGY: ~3 часа; AI_BUILD_PLAN: 3-6ч — диапазон согласованный |
| **ONNX export** | OK | AI_BUILD_PLAN: opset_version=14; AI_STRATEGY: opset_version=14 — совпадает |

---

## 4. Противоречивые цифры

| Показатель | Значения | Где | Статус |
|------------|----------|-----|--------|
| **AUC-ROC target** | >= 0.88 | IDEAS.md фаза 2 | WARNING: PITCH.md > 0.85 |
| **AUC-ROC target** | > 0.85 | PITCH.md слайд 5 | WARNING: ниже чем в IDEAS |
| **Sensitivity target** | >= 85% | IDEAS.md фаза 1 | WARNING: PITCH > 90% |
| **Sensitivity target** | > 90% | PITCH.md слайд 5 | WARNING: выше чем в IDEAS |
| **Vision model sensitivity** | 91% | IDEAS.md 1.2 (ожидаемый) | OK — это ожидание, не target |
| **Пилотных учреждений** | 6 | IDEAS + PITCH — совпадает | OK |
| **Пациентов пилот (фаза 1)** | 500 | IDEAS.md | OK — PITCH: "500+" |
| **Скринингов/год (фаза 3)** | 50,000 | IDEAS.md + PITCH | OK |
| **Время приёма (сокращение)** | 18->9 мин | IDEAS.md 1.1 | OK — нигде не противоречит |
| **Количество ФАП** | 3,847 | IDEAS.md 1.4 | OK — нигде не упоминается |
| **Inference time (GPU)** | < 2.5 сек | IDEAS.md | WARNING: AI_STRATEGY ~75ms для vision-only |
| **Fusion score threshold** | >= 0.65 | IDEAS.md 1.2 | WARNING: AI_STRATEGY >= 0.70 для refer_hepatology — разные пороги |

---

## 5. Полнота документов

| Документ | Разделы | Статус |
|----------|---------|--------|
| IDEAS.md | 10 идей + demo-сценарий + дифференциация + roadmap + риски | OK |
| AI_STRATEGY.md | 3 модуля + JSON контракт + roadmap + risk register + команды | OK |
| AI_BUILD_PLAN.md | Фазы 0-5 + timeline + Docker + CI/CD + чек-лист | OK |
| ARCHITECTURE.md | C4 + data flow + auth + Docker + OpenAPI + DB schema + ports | OK |
| ML_LAB_DESIGN.md | Компоненты + цвета + типографика + адаптив + accessibility + migration | OK |
| PITCH.md | 8 слайдов + speaker notes + FAQ | OK |
| DATASET.md | 8 датасетов + pipeline + de-identification + лицензии | OK |

---

## 6. CRITICAL Issues (требуют исправления)

### #C1: Модель — 4 разные версии EfficientNet
- **Где**: IDEAS (B4), AI_STRATEGY (B3), AI_BUILD_PLAN (B0), PITCH (B3)
- **Рекомендация**: Выбрать одну модель как PRIMARY. Предлагаю **EfficientNet-B3** (баланс AI_STRATEGY + PITCH). В AI_BUILD_PLAN изменить B0->B3. В IDEAS изменить B4->B3. Добавить footnote: "B0 — fallback при VRAM < 6GB, B4 — при > 12GB".

### #C2: Fusion веса — противоположные значения
- **Где**: IDEAS (clinical 0.4 + vision 0.6) vs AI_STRATEGY (clinical 0.7 + vision 0.3)
- **Рекомендация**: Исправить в IDEAS.md на clinical 0.7 + vision 0.3 (более детализированная и обоснованная схема из AI_STRATEGY). Или добавить пояснение в IDEAS, что 0.4/0.6 — это legacy-предположение, а 0.7/0.3 — скалиброванные веса.

### #C3: Risk tier enum — 3 разных набора значений
- **Где**: IDEAS/AI_STRATEGY (`low/watch/urgent/refer_hepatology`), ML_LAB_DESIGN (`low/moderate/high/critical`), ARCHITECTURE (`risk_level: high`)
- **Рекомендация**: Унифицировать. ML_LAB_DESIGN должен использовать `low/watch/urgent/refer_hepatology` (как clinical triage logic) и маппить их на UI-цвета. Добавить explicit mapping: low->green, watch->yellow, urgent->orange, refer_hepatology->red.

### #C4: Конфликт нумерации фаз AI_STRATEGY vs AI_BUILD_PLAN
- **Где**: Оба документа используют Phase 0-5 с разным содержанием
- **Рекомендация**: AI_BUILD_PLAN — это implementation plan в часах (48-72ч). AI_STRATEGY — это research roadmap в неделях. Переименовать в AI_BUILD_PLAN на "Шаги 0-5" или "Implementation Steps", а в AI_STRATEGY оставить "Фазы 0-5". Добавить cross-reference: "Детальный план реализации Фазы 2 — см. AI_BUILD_PLAN.md".

---

## 7. WARNING Issues (рекомендуется исправить)

### #W1: AUC target — 0.88 vs 0.85
- Исправить PITCH.md на "AUC >= 0.88" (привести к IDEAS.md)

### #W2: Sensitivity target — 85% vs 90%
- Унифицить: для фиброза >= F2 target = 85%, для F3-F4 target = 90%

### #W3: Датасеты — разные списки в DATASET.md и AI_STRATEGY
- Добавить cross-reference: в AI_STRATEGY ссылку на DATASET.md для полного списка. В DATASET.md добавить AI_STRATEGY-упомянутые датасеты (Mendeley NAFLD, LiverBoost) с пометкой "reference only".

### #W4: INPUT_SIZE — 224 vs 512 vs 384
- AI_BUILD_PLAN использует 224x224 (для B0). AI_STRATEGY использует 512x512 (для B3). DATASET.md упоминает 224 или 384. Если PRIMARY = B3, то INPUT_SIZE должен быть 300x300 (стандарт для B3) или 512x512. Унифицить.

### #W5: Inference latency — 2.5с vs 75ms
- Добавить пояснение в IDEAS.md: "< 2.5 сек — полный end-to-end pipeline (upload + preprocessing + inference + explainability + response formation)". В AI_STRATEGY: "~75ms — только EfficientNet-B3 forward pass".

---

## Итог: 10 OK, 6 WARNING, 4 CRITICAL

| Категория | Количество |
|-----------|-----------|
| OK | 10 |
| WARNING | 6 |
| CRITICAL | 4 |

### Приоритет исправлений:
1. **#C1** (модель) — выбрать B3, синхронизировать все документы
2. **#C2** (fusion веса) — clinical 0.7 + vision 0.3 везде
3. **#C3** (risk tier enum) — унифицировать на low/watch/urgent/refer_hepatology
4. **#C4** (фазы) — разделить нумерацию AI_STRATEGY и AI_BUILD_PLAN
