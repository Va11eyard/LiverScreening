# DATASET.md — Датасеты для обучения HepatoScreen

> **Проект:** HepatoScreen — ИИ-скрининг патологий печени и хронического вирусного гепатита (HBV) для ПМСП Казахстана  
> **Репозиторий:** https://github.com/Va11eyard/LiverScreening  
> **Архитектура:** EfficientNet-B0/B3, ConvNeXt-Tiny  
> **GPU:** RTX 5050 Laptop (~8 GB VRAM)  
> **Дата документа:** 2025-01-19  
> **Статус:** living document — обновляется по мере появления новых открытых датасетов

---

## Содержание

1. [Открытые датасеты УЗИ печени](#1-открытые-датасеты-узи-печени)
2. [HepatoScreen Platform Export](#2-hepatoscreen-platform-export)
3. [Data Pipeline](#3-data-pipeline)
4. [De-identification и PHI](#4-de-identification-и-phi)
5. [Минимальный N для credible demo](#5-минимальный-n-для-credible-demo)
6. [Synthetic data (fallback)](#6-synthetic-data-fallback)
7. [Лицензии summary](#7-лицензии-summary)
8. [Ссылки и поисковые стратегии](#8-ссылки-и-поисковые-стратегии)

---

## 1. Открытые датасеты УЗИ печени

### 1.1 Ключевые датасеты (рекомендованы к использованию)

#### 1.1.1 Saudi NAFLD Ultrasound Dataset (Alshagathrh et al., 2024)

| Параметр | Значение |
|----------|----------|
| **Название** | Large annotated ultrasound dataset of NAFLD from Saudi hospitals |
| **Ссылка** | OSF: https://doi.org/10.17605/OSF.IO/C2YG8 |
| **Размер** | **10,352 изображения**, 384 пациента |
| **Классы** | Стеатоз: Grade 0–3 (NAS); Фиброз: Stage 0–4 (NAS) |
| **Формат** | PNG, 768×1024 px (конвертировано из DICOM) |
| **Разметка** | Expert-annotated, biopsy-proven (3 гепатопатолога, Cohen's kappa = 0.922) |
| **Лицензия** | **Restricted access** — требуется подписание соглашения, non-commercial research only |
| **Год** | 2024 |
| **Устройства** | Разные УЗИ-аппараты (KSUMC + NGHA, Саудовская Аравия) |

**Структура:**
- Две папки: `Steatosis/` и `Fibrosis/`
- В каждой: `Gray-Scale Images/` + `Coloured Images/`
- Подпапки по грейдам NAS

**Распределение стеатоза:**
| Grade | Изображения |
|-------|-------------|
| Grade 0 (<5%) | 3,283 |
| Grade 1 (5–33%) | 2,597 |
| Grade 2 (33–66%) | 2,283 |
| Grade 3 (>66%) | 1,144 |

**Распределение фиброза:**
| Stage | Изображения |
|-------|-------------|
| F0 (No fibrosis) | 1,751 |
| F1 (Mild) | 7,122 |
| F2 (Perisinusoidal) | 1,015 |
| F3 (Bridging) | 203 |
| F4 (Cirrhosis) | 174 |

**Доступ:** Требуется регистрация на OSF + соглашение о конфиденциальности. Коммерческое использование запрещено без явного разрешения. Время одобрения: ~1–2 недели.

---

#### 1.1.2 BEHSOF Dataset (2024)

| Параметр | Значение |
|----------|----------|
| **Название** | BEHSOF: Advanced NAFLD Dataset with Clinical Metadata |
| **Ссылка** | Figshare: https://figshare.com/articles/dataset/26389069 |
| **Размер** | **113 пациентов**, УЗИ + клинические метаданные |
| **Классы** | Стеатоз (уровни) + Фиброз (уровни) |
| **Формат** | ~ожидается PNG/JPEG |
| **Разметка** | Expert-annotated с Fibroscan reference |
| **Лицензия** | ~ожидается CC BY-NC или restricted (требует уточнения на Figshare) |
| **Год** | 2024 |

**Особенности:** Включает клинические данные (blood tests) + результаты Fibroscan — полезно для multimodal подхода.

---

#### 1.1.3 B-mode Fatty Liver Ultrasound Dataset (Byra et al., 2018)

| Параметр | Значение |
|----------|----------|
| **Название** | Dataset of B-mode fatty liver ultrasound images |
| **Ссылка** | Zenodo: https://zenodo.org/records/1009146 |
| **Статья** | https://doi.org/10.1007/s11548-018-1843-2 |
| **Размер** | ~52.4 MB (~ожидается сотни изображений) |
| **Классы** | Бинарная классификация: normal vs fatty liver |
| **Формат** | ~ожидается PNG/JPEG |
| **Разметка** | Expert-annotated, biopsy-proven |
| **Лицензия** | ~ожидается CC BY (требует уточнения на Zenodo) |
| **Год** | 2018 |
| **Устройства** | УЗИ-аппараты, Медицинский университет Варшавы |

---

#### 1.1.4 Liver Histopathology (Fibrosis) Ultrasound Images — Kaggle

| Параметр | Значение |
|----------|----------|
| **Название** | Liver Histopathology (Fibrosis) Ultrasound Images |
| **Ссылка** | Kaggle: https://www.kaggle.com/code/houssameddinebhe/liver-histopathology-fibrosis-ultrasound-images/input |
| **Размер** | **6,323 изображения** |
| **Классы** | Фиброз F0–F4 (METAVIR scoring) |
| **Формат** | ~ожидается PNG/JPEG |
| **Разметка** | Clinical labels по METAVIR (Seoul St. Mary's Hospital, Eunpyeong St. Mary's Hospital) |
| **Лицензия** | Kaggle Terms of Use (требует уточнения, ~ожидается CC0 или restricted) |
| **Год** | ~2022–2023 (публикация на Kaggle) |

**Распределение:**
- F0 и F4 наиболее представлены (F4 = ~27% датасета)
- F1, F2, F3 — ~13% каждый (imbalanced)

---

#### 1.1.5 AUL (Annotated Ultrasound Liver) Dataset

| Параметр | Значение |
|----------|----------|
| **Название** | AUL: Annotated Ultrasound Liver |
| **Ссылка** | Zenodo: доступен через https://zenodo.org/records/ |
| **Размер** | **50,063 изображений и видео-фреймов**; 435 malignant, 200 benign, 100 normal annotated |
| **Классы** | Liver mass classification (benign/malignant), liver segmentation |
| **Формат** | ~ожидается PNG/JPEG |
| **Разметка** | Expert-annotated (subset: 735 annotated) |
| **Лицензия** | **CC BY 4.0** |
| **Год** | ~2022–2023 |

**Особенности:** Подходит для задач детекции очаговых образований печени. Основной фокус — не стеатоз/фиброз, а masses.

---

### 1.2 Датасеты для HBV/ХВГ (ограниченная доступность)

| Датасет | Описание | Статус |
|---------|----------|--------|
| **Dalian CHB Cohort** (2024) | 1,609 пациентов с ХВГ (CHB), LSM + клинические данные. Нет открытого доступа к изображениям — data available upon request. | Restricted |
| **Rwanda HBV/HCV Ultrasound** (2025) | 240 пациентов (120 HBV, 120 HCV), B-mode УЗИ. Популяционное исследование, данные не опубликованы как датасет. | Нет открытого датасета |

**Вывод по HBV:** Открытых датасетов УЗИ печени **специфично для HBV практически нет**. Рекомендуется:
1. Использовать общие NAFLD датасеты для pre-training
2. Fine-tune на собственных HBV-данных из HepatoScreen Platform
3. Рассмотреть коллаборацию с больницами в Руанде/Китае (статьи с HBV cohorts)

---

### 1.3 Сводная таблица датасетов

| Датасет | N изображений | N пациентов | Классы | Формат | Лицензия | Год |
|---------|--------------|-------------|--------|--------|----------|-----|
| Saudi NAFLD (OSF) | 10,352 | 384 | Стеатоз G0-3, Фиброз F0-4 | PNG 768×1024 | Restricted (NC) | 2024 |
| BEHSOF (Figshare) | ~数百 | 113 | Стеатоз + Фиброз | ~PNG | ~CC BY-NC | 2024 |
| Byra et al. (Zenodo) | ~数百 | ~数十 | Normal vs Fatty | ~PNG | ~CC BY | 2018 |
| Kaggle Liver Fibrosis | 6,323 | ~ожидается | Фиброз F0-4 (METAVIR) | ~PNG/JPEG | Kaggle ToU | ~2023 |
| AUL (Zenodo) | 50,063 | 11,468 | Liver mass (benign/malignant) | ~PNG/JPEG | **CC BY 4.0** | ~2023 |

---

## 2. HepatoScreen Platform Export

### 2.1 Структура training-export ZIP

```
training-export/
├── images/
│   ├── us_001_001.png          # B-mode УЗИ снимок
│   ├── us_001_002.png          # Множественные срезы на пациента
│   ├── us_002_001.png
│   └── ...
├── metadata.csv                # CSV с клиническими данными
├── manifest.json               # Описание экспорта (дата, версия, больница)
└── README.txt                  # Инструкции по использованию
```

### 2.2 CSV Schema

| Колонка | Тип | Описание | PHI? |
|---------|-----|----------|------|
| `patient_id` | string | Псевдонимизированный ID пациента | Нет (если хэширован) |
| `age` | int | Возраст на момент исследования | Нет |
| `gender` | string | Пол (M/F) | Нет |
| `ast` | float | AST (аспартатаминотрансфераза), U/L | Нет |
| `alt` | float | ALT (аланинаминотрансфераза), U/L | Нет |
| `platelets` | int | Тромбоциты, ×10⁹/L | Нет |
| `hbv_status` | string | HBsAg (+/-), HBeAg, anti-HBc | Нет |
| `etiology` | string | Этиология: HBV/NAFLD/ALC/Other | Нет |
| `fibrosis_stage` | string | F0–F4 (METAVIR или локальная шкала) | Нет |
| `steatosis_grade` | string | S0–S3 (или none/mild/moderate/severe) | Нет |
| `cirrhosis_suspected` | bool | Подозрение на цирроз (Y/N) | Нет |
| `image_filenames` | string[] | Список файлов УЗИ для пациента | Нет |
| `hospital_id` | string | ID ПМСП (анонимизированный) | Нет |
| `study_date` | date | Дата исследования (сдвинута ±30 дней) | Да (если оригинальная) |
| `notes` | string | Примечания радиолога | Может содержать PHI |

### 2.3 Связь УЗИ с клиническими данными

```python
# Пример связывания
import pandas as pd

metadata = pd.read_csv('metadata.csv')
# patient_id → image_filenames маппинг
# Один пациент → 1..N УЗИ-снимков

# Каждый снимок наследует клинические маркеры пациента:
# - fibrosis_stage, steatosis_grade — target labels
# - ast, alt, platelets — дополнительные features для multimodal model
# - hbv_status — фильтрация по когорте
```

### 2.4 Объём данных

| Этап | Ожидаемый N пациентов | Ожидаемый N снимков | Примечание |
|------|----------------------|---------------------|------------|
| Хакатон (текущий) | ~50–100 | ~200–500 | Пилотные ПМСП, ручной сбор |
| Пилот (6 мес) | ~500–1,000 | ~2,000–5,000 | 6 ПМСП в Астане/Алматы |
| Расширение (12 мес) | ~3,000–5,000 | ~10,000–20,000 | Масштабирование на регионы |

---

## 3. Data Pipeline

### 3.1 Preprocessing

| Шаг | Параметр | Пояснение |
|-----|----------|-----------|
| **Resize** | 224×224 или 384×384 | 224×224 для EfficientNet-B0; 384×384 для B3 |
| **Grayscale → RGB** | Duplicate channels | УЗИ — grayscale; дублируем в 3 канала для ImageNet pre-trained моделей |
| **Normalization** | ImageNet mean/std или dataset-specific | `[0.485, 0.456, 0.406]` / `[0.229, 0.224, 0.225]` — для transfer learning |
| **Histogram equalization** | CLAHE (optional) | Улучшение контраста УЗИ-изображений |

### 3.2 Augmentations (медицинские, ultrasound-aware)

**Пространственные:**
| Трансформация | Параметры | Обоснование |
|---------------|-----------|-------------|
| Random rotation | ±15° | Вариативность позиции датчика |
| Horizontal flip | p=0.5 | Симметрия печени |
| Vertical flip | НЕ использовать | Нарушает анатомическую ориентацию |
| Random crop + resize | scale (0.9, 1.1) | Вариативность FOV |
| Elastic deformation | α=10–20, σ=3 | Имитирует деформацию тканей |

**Фотометрические:**
| Трансформация | Параметры | Обоснование |
|---------------|-----------|-------------|
| Brightness | ±10–20% | Разные настройки gain |
| Contrast | ±10–15% | Вариативность контраста УЗИ |
| Gamma correction | 0.8–1.2 | Разные monitor settings |
| Gaussian noise | σ=5–20 | Speckle noise inherent to US |
| Gaussian blur | σ=0.5–1.5 | Depth-dependent resolution drop |

**Инструменты:**
- **Primary:** Albumentations (https://albumentations.ai/) — быстрый, GPU-friendly
- **Medical-specific:** TorchIO (https://torchio.readthedocs.io/) — elastic deformation, spatial transforms
- **PyTorch native:** torchvision.transforms

### 3.3 Train/Val/Test Split

| Стратегия | Пропорция | Примечание |
|-----------|-----------|------------|
| **Стандартный** | 80% train / 10% val / 10% test | Для N > 1,000 |
| **Stratified** | По классам (steatosis grade + fibrosis stage) | Обязателен для imbalanced данных |
| **Patient-level** | Все снимки одного пациента — в одном сплите | Предотвращает data leakage |

**Для малого N (< 500):**
- **5-fold Cross-Validation** — обязательно
- Leave-one-group-out (по больницам/операторам)

### 3.4 Pipeline код (шаблон)

```python
import albumentations as A
from albumentations.pytorch import ToTensorV2

# Train transforms
train_transform = A.Compose([
    A.Resize(224, 224),
    A.Rotate(limit=15, p=0.5),
    A.HorizontalFlip(p=0.5),
    A.RandomBrightnessContrast(brightness_limit=0.1, contrast_limit=0.1, p=0.5),
    A.GaussNoise(var_limit=(5, 20), p=0.3),
    A.ElasticTransform(alpha=10, sigma=3, p=0.3),
    A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ToTensorV2(),
])

# Val/Test transforms (only resize + normalize)
val_transform = A.Compose([
    A.Resize(224, 224),
    A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ToTensorV2(),
])
```

---

## 4. De-identification и PHI

### 4.1 Что считается PHI в Казахстане

На основе аналогии с HIPAA Safe Harbor + казахстанское законодательство (Закон РК «О персональных данных»):

| Категория | Примеры | Риск |
|-----------|---------|------|
| **Прямые идентификаторы** | ФИО, ИИН, номер мед. карты, телефон | Критический — обязательно удалить |
| **Даты** | Точная дата рождения, дата исследования | Высокий — обезличить (сдвиг ±30 дней) |
| **Биометрические** | Голос, отпечатки (не применимо к УЗИ) | — |
| **Изображения** | Burned-in text на УЗИ (ФИО, ИИН, дата) | Критический — OCR + redaction |
| **DICOM metadata** | Patient Name (0010,0010), Birth Date (0010,0030), Accession Number (0008,0050) | Критический — strip all tags |

### 4.2 Методы деидентификации УЗИ

**Этап 1: DICOM metadata stripping**
```python
import pydicom

def deidentify_dicom(ds: pydicom.Dataset) -> pydicom.Dataset:
    """Remove PHI from DICOM header."""
    phi_tags = [
        (0x0010, 0x0010),  # Patient's Name
        (0x0010, 0x0020),  # Patient ID
        (0x0010, 0x0030),  # Patient's Birth Date
        (0x0010, 0x0040),  # Patient's Sex
        (0x0008, 0x0050),  # Accession Number
        (0x0008, 0x0090),  # Referring Physician
        (0x0008, 0x0020),  # Study Date → shift ±30 days
        (0x0008, 0x0030),  # Study Time
    ]
    for tag in phi_tags:
        if tag in ds:
            if tag == (0x0008, 0x0020):
                ds[tag].value = shift_date(ds[tag].value)  # Сохраняем относительный порядок
            else:
                ds[tag].value = ""
    # Remove private tags
    ds.remove_private_tags()
    return ds
```

**Этап 2: Burned-in text detection & redaction**
- Использовать OCR (Tesseract / EasyOCR) для обнаружения текста в пикселях
- Или: определить фиксированные ROI (region of interest) где обычно располагается текст (верх/низ УЗИ-изображения)
- Заменить на чёрные прямоугольники (black bar redaction)

**Этап 3: Проверка**
- Ручная выборочная проверка 10% изображений
- Проверка что text не содержит PHI (sample review)

### 4.3 Соответствие нормативам

| Регулятор | Статус | Требование |
|-----------|--------|------------|
| **HIPAA** | Не применяется напрямую (не США) | Рекомендуется как best practice |
| **GDPR** | Возможно применимо (если граждане ЕС) | Аналогичные требования к anonymization |
| **Закон РК «О персональных данных»** | **Применяется** | Обезличивание перед передачей третьим лицам |
| **Ethical review** | **Обязателен** | Одобрение этического комитета каждой ПМСП |

### 4.4 Consent (информированное согласие)

**Обязательные элементы:**
- [ ] Согласие на проведение УЗИ (клиническое)
- [ ] Согласие на использование данных в ML/AI research
- [ ] Согласие на передачу обезличенных данных третьим лицам
- [ ] Право на отзыв согласия
- [ ] Описание целей: "разработка ИИ-системы скрининга печени"

**Шаблон согласия** должен быть утверждён этическим комитетом и юристами проекта.

---

## 5. Минимальный N для credible demo

### 5.1 Таблица: задача → минимальный N → что показать

| Задача | Минимальный N | Transfer Learning? | Что можно показать | Доверие |
|--------|--------------|--------------------|--------------------|---------|
| **Хакатон / prototype** | 50–100 снимков | Да (ImageNet) | Working demo, inference pipeline, UI integration | Низкое (proof-of-concept) |
| **Хакатон (улучшенный)** | 100–500 снимков | Да + open dataset pretrain | Confusion matrix, accuracy > random, Grad-CAM | Среднее |
| **Пилот в ПМСП** | 500–1,000 пациентов | Да | Sensitivity, Specificity, AUC-ROC по классам | Умеренное |
| **Публикация (conference)** | 1,000–3,000 изображений | Да | Stratified metrics, external validation, ablation study | Хорошее |
| **Публикация (journal)** | 3,000–10,000 изображений | Да | Multi-center, inter-rater agreement, clinical impact | Высокое |
| **Регуляторное одобрение** | 10,000+ изображений, multicenter | Да | Prospective study, sensitivity/specificity > 90% | Регуляторное |

### 5.2 Рекомендации по HepatoScreen

| Этап | N целевой | Стратегия |
|------|----------|-----------|
| **Хакатон** | 50–100 реальных + 1,000+ из open dataset | Stub UI + real inference pipeline. Pre-train на Saudi NAFLD (10K images), fine-tune на 50–100 своих |
| **Пилот (6 мес)** | 500–1,000 пациентов | Stratified collection по стеатозу/фиброзу. 5-fold CV. Grad-CAM для explainability |
| **Публикация** | 3,000+ изображений + external validation | Сотрудничество с 2+ больницами для external test set |

### 5.3 Transfer Learning strategy

```
ImageNet (1.4M images) 
    → Pre-train backbone (EfficientNet/ConvNeXt)
    → Saudi NAFLD (10,352 images) — domain adaptation
        → HepatoScreen data (50–1,000 images) — fine-tuning
            → Evaluation on held-out test set
```

**С冻结/разморозка слоёв:**
- Этап 1: Заморозить backbone, обучать только classifier head (lr=1e-3)
- Этап 2: Разморозить последние 2–3 blocks (lr=1e-4)
- Этап 3: Fine-tune всей сети с маленьким lr (1e-5)

---

## 6. Synthetic data (fallback)

### 6.1 GAN-based synthesis

| Подход | Инструмент | Плюсы | Минусы |
|--------|-----------|-------|--------|
| **StyleGAN2/3** | PyTorch / NVIDIA | Высокое качество изображений | Требует много данных для обучения; артефакты на мед. изображениях |
| **DDPM / Latent Diffusion** | MONAI Generative, Diffusers | Лучшее качество; контролируемая генерация | Медленная генерация; требует GPU |
| **VAE-GAN** | MONAI | Быстрая генерация; latent space control | Более низкое качество |

### 6.2 Diffusion models (state-of-the-art)

**MONAI Generative Models** (https://github.com/Project-MONAI/GenerativeModels):
- Latent Diffusion Model (LDM) для 2D/3D медицинских изображений
- Условная генерация (по классу, segmentation mask)
- SPADE normalization для semantic synthesis

**MAISI** (NVIDIA, 2024):
- 3D Latent Diffusion Model для CT/MRI
- Включает ControlNet для контролируемой генерации
- Улучшает downstream segmentation на 2.5–4.5% Dice

### 6.3 TorchIO

| Функция | Описание |
|---------|----------|
| **Augmentation** | Spatial (flip, affine, elastic), Intensity (blur, noise, gamma) |
| **Preprocessing** | Resample, normalization, crop/pad |
| **Patch-based sampling** | Для 3D volumetric данных |

```python
import torchio as tio

transform = tio.Compose([
    tio.RandomFlip(axes=['horizontal'], p=0.5),
    tio.RandomAffine(degrees=15, p=0.5),
    tio.RandomElasticDeformation(max_displacement=3, p=0.3),
    tio.RandomGamma(log_gamma=(-0.1, 0.1), p=0.3),
    tio.RandomBlur(std=(0.5, 1.0), p=0.2),
    tio.RandomNoise(std=(5, 20), p=0.2),
])
```

### 6.4 Pros/Cons synthetic data для медицинской визуализации

| Pros | Cons |
|------|------|
| Увеличение датасета при rare classes | Риск distribution shift (synthetic vs real) |
| Балансировка классов (oversampling minority) | Возможные артефакты нехарактерные для УЗИ |
| Сохранение privacy (нет PHI) | Требует validation radiologist'ом |
| Дешевле чем сбор реальных данных | Может ухудшить generalization если плохо сделано |

### 6.5 Когда использовать synthetic data

| Сценарий | Рекомендация |
|----------|-------------|
| **Real N < 500** | Обязательно: synthetic augmentation + transfer learning + heavy regularization |
| **500 < Real N < 2,000** | Рекомендуется: oversampling minority classes (SMOTE в feature space или GAN в image space) |
| **Real N > 5,000** | Не критично; можно ограничиться classical augmentations |

### 6.6 Гибридный подход (рекомендуется для HepatoScreen)

```
1. Собрать все доступные реальные данные (N real)
2. Pre-train на открытых датасетах (Saudi NAFLD 10K + Kaggle Fibrosis 6K)
3. Если class imbalance:
   - Сгенерировать synthetic samples для minority classes (GAN/diffusion)
   - Соотношение real:synthetic ≤ 2:1 (чтобы не доминировал synthetic)
4. Augmentations (Albumentations/TorchIO) для всех классов
5. Train с heavy regularization (dropout, weight decay, early stopping)
```

---

## 7. Лицензии summary

| Датасет | Лицензия | Коммерческое использование | Цитирование | Доступ |
|---------|----------|---------------------------|-------------|--------|
| Saudi NAFLD (OSF) | Restricted + NC agreement | **Нет** (без explicit permission) | Да (статья 2024) | По запросу, ~1–2 недели |
| BEHSOF (Figshare) | ~CC BY-NC (уточнить) | ~Нет | Да | Прямой download |
| Byra et al. (Zenodo) | ~CC BY (уточнить) | ~Да | Да (обязательно) | Прямой download |
| Kaggle Liver Fibrosis | Kaggle ToU / ~CC0 | Проверить лицензию | Да | Kaggle account |
| AUL (Zenodo) | **CC BY 4.0** | **Да** | Да | Прямой download |
| ImageNet (pretrain) | ImageNet ToU | Да (для модели) | Не требуется | Прямой download |

### 7.1 Лицензии HepatoScreen Derivatives

| Артефакт | Рекомендуемая лицензия |
|----------|------------------------|
| Обученная модель (weights) | Apache 2.0 или MIT |
| Код обучения | Apache 2.0 |
| Синтетические данные | CC BY 4.0 (если generated in-house) |
| Аналитические отчёты | CC BY 4.0 |

---

## 8. Ссылки и поисковые стратегии

### 8.1 Прямые ссылки

1. Saudi NAFLD Dataset: https://doi.org/10.17605/OSF.IO/C2YG8
2. BEHSOF Dataset: https://figshare.com/articles/dataset/26389069
3. Byra et al. Zenodo: https://zenodo.org/records/1009146
4. Kaggle Liver Fibrosis: https://www.kaggle.com/code/houssameddinebhe/liver-histopathology-fibrosis-ultrasound-images/input
5. AUL Dataset: https://zenodo.org/records/ (search "AUL ultrasound liver")
6. UltraBench (benchmark): https://github.com/adamtupper/ultrabench
7. MONAI: https://monai.io/
8. MONAI Tutorials: https://github.com/Project-MONAI/tutorials
9. TorchIO: https://torchio.readthedocs.io/
10. MONAI Generative Models: https://github.com/Project-MONAI/GenerativeModels
11. Albumentations: https://albumentations.ai/
12. Ultrasound Open Access Directory: https://ultrasound-open-access.nidusai.ca/
13. Binary Steatosis Classifier (Montreal): https://github.com/LCTI-AnTang/binary_steatosis_classifier

### 8.2 Поисковые стратегии для нахождения новых датасетов

**PubMed / Google Scholar:**
```
"NAFLD ultrasound dataset" OR "fatty liver ultrasound" OR
"liver steatosis ultrasound deep learning" OR
"liver fibrosis ultrasound dataset" OR
"HBV ultrasound artificial intelligence"
```

**Kaggle:**
```
liver ultrasound, liver fibrosis, NAFLD, steatosis, hepatitis B ultrasound
```

**Zenodo / Figshare / OSF:**
```
liver ultrasound, hepatic steatosis, NAFLD imaging, fibrosis staging
```

**The Cancer Imaging Archive (TCIA):**
```
https://www.cancerimagingarchive.net/ — поиск по "liver ultrasound"
```

**Реестр открытых УЗИ-датасетов:**
```
https://ultrasound-open-access.nidusai.ca/ — фильтр по "Liver"
```

---

## Appendix A: Быстрый старт — порядок действий

1. **Сразу:** Подать заявку на Saudi NAFLD Dataset (OSF) — требует времени на одобрение
2. **Параллельно:** Скачать Kaggle Liver Fibrosis + Byra Zenodo dataset
3. **Preprocessing:** Resize 224×224, grayscale→RGB, ImageNet normalization
4. **Augmentations:** Albumentations (rotation 15°, flip, brightness/contrast, elastic)
5. **Transfer learning:** ImageNet → open datasets → HepatoScreen data
6. **Evaluation:** Stratified 5-fold CV, confusion matrix, AUC-ROC, Grad-CAM
7. **De-identification:** pydicom stripping + OCR redaction + ethical review

---

## Appendix B: Архивные материалы (docs/training-code/)

- **EfficientNet на ретинальных снимках** — можно использовать weights как starting point
- Retinal ≠ Liver, но общие паттерны текстуры + границ будут полезны
- Рекомендуется: использовать ImageNet weights вместо retinal (более generic)

---

*Документ составлен на основе публичных источников. Размеры датасетов и лицензии указаны по состоянию на январь 2025 — рекомендуется перепроверить на первоисточниках перед использованием.*
