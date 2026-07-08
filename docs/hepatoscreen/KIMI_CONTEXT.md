# Kimi — контекст HepatoScreen (хакатон)

**Репозиторий:** https://github.com/Va11eyard/LiverScreening  
**Ветка:** `main`  
**Дата снимка:** 2026-03-08

---

## Что это

**HepatoScreen** — прототип ИИ-скрининга патологий печени и ХВГ для ПМСП Казахстана.

| Контур | URL | Роль |
|--------|-----|------|
| Клиника | `:3004` | Кейсы, регистр |
| ML Lab | `:3005` | УЗИ + клиника → inference, overlay |
| ML API | `:8000` | FIB-4/APRI + EfficientNet-B3 |
| Go API | `:8088` | PostgreSQL, кейсы |

Запуск: `pnpm dev` (frontends), Docker: postgres + ml-api + api.

---

## Архитектура ML

- **Vision:** EfficientNet-B3, 300×300, binary: `Норма` / `Стеатоз / NAFLD`
- **Clinical:** FIB-4, APRI, HBV-aware пороги
- **Fusion:** clinical **0.7** + vision **0.3** → `low` / `watch` / `urgent` / `refer_hepatology`
- **Статус:** CDS-прототип, не медизделие; врач принимает решение

Ключевые файлы:
- `services/ml-api/app/inference.py`
- `services/ml-api/app/model_loader.py`
- `services/ml-api/training/`
- `docs/hepatoscreen/DECISIONS.md`
- `docs/hepatoscreen/METRICS.md`
- `docs/hepatoscreen/PITCH_DECK.md`

---

## Данные (обучение выполнено)

Синтетика **удалена**. Только реальные открытые датасеты:

| Источник | Объём | Разметка | Лицензия |
|----------|-------|----------|----------|
| [Zenodo Byra](https://zenodo.org/records/1009146) | 550 кадров, 55 пациентов × 10 | Стеатоз 0/1, biopsy-proven | CC BY |
| [Mendeley NFLD](https://doi.org/10.17632/6rg4hk6728) | 87 снимков, 86 пациентов | Normal/Benign/Malignant + ALT, AST, BMI… | CC BY 4.0 |

**Итого:** 637 изображений, 141 пациент. Split по `patient_id` (GroupShuffleSplit 70/15/15).

Пайплайн:
1. `training/extract_zenodo_mat.py` — `.mat` → PNG
2. `training/prepare_mendeley_nfld.py` — images + `Clinical_data.xlsx`
3. `training/merge_datasets.py` — train/val/test CSV
4. `training/train_efficientnet.py` — AMP, RTX 5050 cu128
5. `training/train_clinical_baseline.py` — LogisticRegression на NFLD features
6. `training/eval_multimodal.py` — image vs clinical vs fusion

Веса `.pth` / `.onnx` в git не коммитятся (локально после train).

---

## Метрики (test split)

| Метрика | Значение |
|---------|----------|
| Vision balanced_accuracy | 0.668 |
| Vision weighted_f1 | 0.757 |
| Vision AUC (all) | 0.703 |
| Zenodo external AUC (image) | 0.685 |
| NFLD subset AUC (image) | 0.909 |
| Clinical baseline val AUC (NFLD) | 0.909 |

Fusion на общем тесте слабее image-only, т.к. у Zenodo нет клинических полей в датасете (clinical_prob = 0).

Подробно: `docs/hepatoscreen/METRICS.md`, `services/ml-api/docs/metrics/multimodal_eval.json`

---

## Питч (планируется)

- Слайд **PathAI AIM-MASH** только как positioning: upstream ПМСП (мы) vs downstream гистология/trials (PathAI). Без интеграции в код.
- См. `docs/hepatoscreen/PITCH_DECK.md`

---

## Вопрос к Kimi: Kaggle Fibrosis 6K

**Пока НЕ скачивали и НЕ внедряли.** Нужна ваша рекомендация перед любым кодом.

**Датасет (кандидат):** [Kaggle Liver Histopathology Fibrosis Ultrasound](https://www.kaggle.com/datasets/houssameddinebhe/liver-histopathology-fibrosis-ultrasound-images) — ~6 323 B-mode, METAVIR F0–F4.

**Гипотеза:** pretrain EfficientNet-B3 на Kaggle (domain: больше УЗИ-текстур) → fine-tune на Zenodo+NFLD (бинарный стеатоз/NAFLD).

### Вопросы

1. Имеет ли смысл Kaggle при текущих метриках (AUC 0.70 overall, Zenodo external 0.68), или лучше не трогать до пилота ПМСП?
2. Маппинг F0–F4 для pretrain: **F0–F1=0 / F2–F4=1** vs **F0=0 / F1–F4=1** vs **5-class head** — что лучше для downstream стеатоз-скрининга?
3. Сколько epochs pretrain (6K) vs fine-tune (637)? Риск catastrophic forgetting на RTX 5050 8GB?
4. Freeze backbone на fine-tune — да/нет, сколько epochs?
5. Как **честно питчить** двухстадийное обучение жюри хакатона (фиброз pretrain → стеатоз finetune)?
6. Нужен ли **Kaggle hold-out eval** в слайдах или достаточно Zenodo external validation?
7. Альтернатива Kaggle: Saudi NAFLD 10K (OSF, restricted) — стоит ли упоминать только в roadmap?

### Ограничения

- Хакатон, дедлайн близко
- Не смешивать F0–F4 и стеатоз в один CSV/один loss без обоснования
- Целевой narrative: реальные данные + multimodal NFLD + честные метрики

### Желаемый формат ответа

- Рекомендация: **да / нет / отложить** по Kaggle
- Если да: маппинг меток, schedule pretrain/finetune, freeze, ожидаемый прирост AUC
- Формулировка для Slide 5 питча (1–2 предложения)
- Red flags для жюри

---

## Demo credentials (seed)

- `coordinator@liver.kz` / `ChangeMe123!`
- `doctor@liver.kz` / `Doctor123!`

---

## Связанные документы в репо

- `docs/hepatoscreen/DATASET.md` — обзор датасетов
- `docs/hepatoscreen/AI_STRATEGY.md` — стратегия
- `docs/hepatoscreen/ARCHITECTURE.md` — архитектура
