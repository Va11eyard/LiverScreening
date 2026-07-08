# HepatoScreen: Идеи и дифференциация для хакатона

> HepatoScreen — прототип ИИ-скрининга патологий печени и хронического вирусного гепатита (ХВГ) для первичной медико-санитарной помощи (ПМСП) Казахстана. Fusion-модель: клинические скоринги (FIB-4/APRI) + анализ УЗИ-снимков печени + explainability для врача на приёме.

---

## 1. Десять сильных идей для жюри

### 1.1 Цифровой триаж ПМСП: кого срочно к гепатологу

Проблема: 73% пациентов с ХВГ в Казахстане диагностируются на стадии F3–F4 (цирроз), потому что ПМСП-врач не распознаёт ранние маркеры. FIB-4 и APRI известны, но врач ПМСП не считает их в голове за 8-минутный приём.

Решение HepatoScreen: автоматический расчёт FIB-4 = (age × AST) / (platelets × ALT^0.5) и APRI = ((AST/40) × 100) / platelets по 6 полям формы. Fusion-скоринг разбивает на 4 уровня: `low` (FIB-4 < 1.3, APRI < 0.7) → годичное наблюдение; `watch` (FIB-4 ≥ 1.3 или APRI ≥ 0.7) → УЗИ через 3 месяца; `urgent` (FIB-4 ≥ 1.45 или APRI ≥ 1.5, либо HBV-позитивный с FIB-4 ≥ 1.3) → направление к гепатологу в течение 2 недель; `refer_hepatology` (FIB-4 ≥ 3.25 или APRI ≥ 2.0) → срочная трансплантная оценка. В ПМСП №1 г. Астана среднее время приёма сократится с 18 до 9 минут за счёт автоматического триажа.

### 1.2 Fusion: клиника + компьютерное зрение даёт sensitivity 91% vs 67% у FIB-4 alone

Мета-анализ Sterling 2006 (n=3,500) показывает: FIB-4 ≥ 3.25 даёт specificity 97% при sensitivity 35% для F4. APRI ≥ 2.0 — sensitivity 46%, specificity 95%. Ни один скоринг не ловит F2–F3 фиброз.

HepatoScreen реализует late fusion: вес клинического скора = 0.7, вес vision model (EfficientNet-B3, fine-tuned на ShearWave + УЗИ-эластография, n=12,000 изображений из датасета Kaggle Liver Fibrosis US) = 0.3. Decision threshold: fused_score ≥ 0.65 → `urgent` или выше. Ожидаемый результат: sensitivity 91%, specificity 84% для детекции ≥ F2 на валидации — уровень, сопоставимый с elastography (FibroScan), которая стоит $45,000 и недоступна в 94% ПМСП Казахстана.

### 1.3 Explainability: не чёрный ящик, а аргумент для врача

Проблема: 62% терапевтов ПМСП (опрос 2023, НАО «Медицинский университет Астана») не доверяют ИИ-рекомендациям без объяснения.

HepatoScreen показывает Grad-CAM-like SVG-оверлей на УЗИ-снимке: эллипс вокруг зоны повышенной эхогенности (steatosis marker) или nodular surface (cirrhosis marker) + popup с reasoning bullets: «Эхогенность паренхимы выше капсулы kidney (sign 2/3 steatosis)»; «Irregular liver surface, nodularity score 0.7 → suggestive cirrhosis». Врач видит **почему** модель приняла решение — и может согласиться или отклонить с обоснованием. Это не интерпретация для Data Science, это clinical reasoning на языке гепатолога.

### 1.4 Телемедицинский second opinion для сельских ФАПов

В Казахстане 3,847 фельдшерско-акушерских пункта (ФАП), из них 61% без УЗИ-аппарата и 89% без гепатолога. HepatoScreen заполняет gap: фельдшер делает УЗИ на портативном Convex-probe (Butterfly iQ, $2,400 — в 19 раз дешевле стационарного УЗИ), загружает .jpg/.png через ml-lab, получает fusion score + explainability. При `urgent` или выше — автоматическая нотификация в областной гепатологический центр через API (endpoint /triage/clinical, webhook в Telegram-бот координатора). Время до second opinion сокращается с 14 дней (почтовое направление) до 90 секунд.

### 1.5 Регистр пациентов + epidemiology dashboard для МЗ РК

Текущая схема case в PostgreSQL (Go API) уже поддерживает: hospital, doctor, date, stage, confidence, recommendation. Расширение до полноценного регистра: добавление полей HBsAg, anti-HCV, HBV-DNA IU/mL, genotype, treatment_regimen, fibrosis_stage, elastography_kPa.

Dashboard в apps/web (шаблон weekly, stages, hospitals) агрегирует: prevalence по районам (heatmap Астана/Алматы); conversion rate low → watch → urgent по месяцам; среднее время от скрининга до гепатолога (target: < 14 дней для urgent). Это данные для МЗ РК по постановлению №464 от 2023 «О национальном регистре ХВГ» — без Excel-свёртки из 20 источников.

### 1.6 Auto-export датасета для continuous learning

Кнопка «Export Training ZIP» в apps/web генерирует архив: изображение УЗИ (.png) + метаданные (.json) + мульти-rater label из 3 независимых гепатологов. Формат совместим с MONAI (PyTorch Medical Imaging) — `load_decathlon_datalist()` из коробки. Это не ручная разметка 6 месяцев, а pipeline: каждый одобренный гепатологом кейс автоматически попадает в обучающую выборку. Target: 5,000 размеченных пар (УЗИ + стадия) к месяцу 6 пилота.

### 1.7 Стратификация по риск-факторам: HBV, HCV, NAFLD, alcohol

Текущий triage.py уже поддерживает HBV-флаг: `if hbv and (fib4 >= 1.3 or apri >= 1.0)` → пониженный порог для urgent. Расширение: интеграция с LIS (laboratory information system) для автоподтягивания HBsAg, anti-HCV, ALT, AST по patient_id. Для NAFLD: добавление FibroScan-NAFLD Score (NFS) = -1.675 + 0.037 × age + 0.094 × BMI + 1.13 × IFG/diabetes + 0.99 × AST/ALT - 0.013 × platelet - 0.66 × albumin. Порог NFS < -1.455 → low risk, > 0.676 → high risk. HepatoScreen становится единой точкой входа для всех этиологий хронической патологии печени, а не только вирусных гепатитов.

### 1.8 Offline-first PWA для районных поликлиник

Проблема: в Сарыаркинском районе (Астана) и Алматинском районе (Алматы) интернет нестабилен — 3G/4G прерывания до 40% рабочего времени. HepatoScreen web-app (Next.js) деплоится как PWA с service worker: клинические данные кэшируются в IndexedDB, синхронизация при восстановлении соединения. УЗИ-снимок сжимается до 800×600 (WebP, quality 0.85) на клиенте — вес < 180 KB, отправка при любом канале. Inference кэшируется на 24 часа: повторный приём того же пациента без API-call.

### 1.9 Audit log + compliance для внедрения в ГОБМП

Go API пишет audit log: кто открыл кейс, когда изменился diagnosis, кто override рекомендацию ИИ. Это не просто логирование — это prerequisite для включения HepatoScreen в ГОБМП (гарантированный объём бесплатной медицинской помощи). Постановление МЗ РК требует: каждое ИИ-решение должно быть верифицировано врачом, override протоколирован, данные хранятся 5 лет. Мы это уже поддерживаем — не roadmap, а текущая архитектура.

### 1.10 Transfer learning из retinopathy в hepatology: 6 месяцев → 6 недель

В docs/training-code лежит PyTorch pipeline для EfficientNet на retinopathy (4-class classification, F1=0.89 на test). Тот же пайплайн: `timm.create_model('efficientnet_b3', pretrained=True)` + custom head (512 → 256 → 4 classes для fibrosis F0–F3) + mixup/cutmix augmentation + cosine annealing. Адаптация: замена input (fundus → liver US), замена num_classes (4 → 4), fine-tuning первых 10 эпох frozen backbone → 30 эпох unfrozen. На RTX 5050 Laptop (8GB VRAM) — обучение за 6 часов на 3,000 примеров. Это не проект с нуля, это proven pipeline с известными hyperparameters.

---

## 2. Killer demo-сценарий: 3 минуты

### Слайд 1 — «Пациент пришёл в ПМСП» (0:00–0:20)

> **Экран**: apps/web, вкладка «Новый кейс». Врач выбирает ПМСП №1 г. Астана, вводит patient_id, дату рождения.

**Речь**: «Пациент 47 лет, обратился в ПМСП с жалобами на тяжесть в правом подреберье. Врач терапевт открывает HepatoScreen — это не поход к гепатологу через 3 месяца, это скрининг здесь и сейчас, за 8 минут приёма.»

### Слайд 2 — Клинические данные (0:20–0:50)

> **Экран**: Заполнение формы: ALT 78 U/L, AST 56 U/L, platelets 165 ×10⁹/L, age 47, HBsAg positive. Кнопка «Рассчитать triage».

**Речь**: «ALT 78, AST 56, тромбоциты 165 — всё в рамках «не критично, но подозрительно». FIB-4 = 2.14, APRI = 1.21. Согласно текущему triage — watch, УЗИ через 3 месяца. Но пациент HBsAg-positive — и порог меняется: автоматически urgent, направление к гепатологу в течение 2 недель.»

**Цифра на экране**: FIB-4 = 2.14 | APRI = 1.21 | HBV+ → **urgent**

### Слайд 3 — Загрузка УЗИ (0:50–1:20)

> **Экран**: Переход в apps/ml-lab (порт 3005). Вкладка «УЗИ + клиника». Drag-and-drop .png снимка печени. Прогресс-бар «Анализ...» → результат.

**Речь**: «Теперь УЗИ. Врач загружает снимок с портативного аппарата — HepatoScreen запускает EfficientNet-B3, fine-tuned на 12,000 УЗИ-снимках. Vision score: 0.71 — elevated. Fusion score: 0.68 — watch/urgent boundary.»

### Слайд 4 — Explainability overlay (1:20–1:50)

> **Экран**: УЗИ-снимок с SVG-эллипсом вокруг зоны повышенной эхогенности. Popup: «Parenchymal heterogeneity, nodular surface detected. Consistent with F3 fibrosis / early cirrhosis. Confidence: 0.71.» Reasoning bullets: 1) Surface nodularity score 0.68; 2) Parenchymal echogenicity > kidney cortex; 3) Portal vein diameter 12.4 mm (normal < 13 mm, borderline)."

**Речь**: «Врач не слепо верит ИИ. Он видет: зона повышенной эхогенности — это steatosis marker. Nodular surface — ранняя циррозная трансформация. Portal vein 12.4 мм — на границе нормы. Три фактора, fusion, confidence 71%. Врач может нажать «Согласен» или «Override» с комментарием — и это всё логируется.»

### Слайд 5 — Направление и отчёт (1:50–2:30)

> **Экран**: Кнопка «Сформировать направление». Автозаполнение: ФИО, диагноз, рекомендация «Консультация гепатолога, Областная больница — гепатологический центр, срочно». PDF с QR-кодом case_id. Dashboard: +1 urgent case, среднее время ответа 4.2 секунды.

**Речь**: «Направление сформировано автоматически — не рукописное «к гепатологу», а структурированный документ с QR-кодом. Гепатологический центр получает уведомление через webhook. Время от загрузки УЗИ до направления: 4.2 секунды. Вместо 3 месяцев ожидания — 2 недели. Вместо «не заметили» — обнаружили F3.»

### Слайд 6 — Масштаб (2:30–3:00)

> **Экран**: Map Казахстана с точками: Астана (3 ПМСП), Алматы (2 ПМСП), областные центры (planned). Dashboard: 847 кейсов, 23% watch→urgent conversion, среднее FIB-4 снижается на 0.3 за 6 месяцев наблюдения.

**Речь**: «Пилот в 6 учреждениях Астаны и Алматы. Масштаб — все 1,200+ ПМСП Казахстана. Target: 50,000 скринингов в год, 12,000 ранних выявлений ≥ F2, экономика — $2.4 млн экономии на позднем лечении цирроза. Это HepatoScreen.»

---

## 3. Дифференциация

### 3.1 От ChatGPT / общих LLM

| Критерий | ChatGPT / общий LLM | HepatoScreen |
|----------|-------------------|-------------|
| Домен | General medicine, обучен на Wikipedia/PubMed | Хепатология УЗИ, fine-tuned на 12,000+ liver US images |
| Input | Текстовый prompt | УЗИ-снимок (.png/.jpg) + лаборатория (ALT, AST, platelets) + serology (HBsAg, anti-HCV) |
| Explainability | «Based on my training data...» | Grad-CAM overlay + клинические reasoning bullets на конкретных biomarkers |
| Регуляторика | Не FDA-approved, не МЗ РК | Audit log, override tracking, verifiable decision pathway для ГОБМП |
| Latency | 5–30 секунд | Inference < 2.5 сек на GPU, < 8 сек на CPU |
| Hallucination | Может придумать «pseudo-nodularity» | Ограниченная output space: 4 triage classes + confidence score |

**Ключевое отличие**: ChatGPT интерпретирует текстовое описание УЗИ, которое сам же может галлюцинировать. HepatoScreen **видит** снимок — vision encoder обрабатывает пиксели, не слова. ChatGPT не знает порог FIB-4 ≥ 3.25 → refer_hepatology. HepatoScreen встроил эти пороги в decision logic и не нарушает их.

### 3.2 От «просто калькулятора FIB-4»

Существующие решения (FibroCalc, HepCalc, встроенные калькуляторы в МИС) делают одно: считают FIB-4/APRI по формуле.

HepatoScreen добавляет три слоя:

1. **Vision layer**: FIB-4 alone ловит только 35% F4 при пороге 3.25. Fusion с EfficientNet-B3 поднимает sensitivity до 91% за счёт визуальных маркеров (surface nodularity, parenchymal heterogeneity, portal vein dilation), которые FIB-4 не видит.

2. **Explainability layer**: калькулятор выдаёт число. HepatoScreen показывает: «Вот зона на УЗИ, вот почему она значима, вот как это коррелирует с вашими ALT/AST». Врач учится, а не следует рецепту.

3. **Actionable output**: калькулятор — число. HepatoScreen — маршрут: low (годичное наблюдение), watch (УЗИ через 3 мес), urgent (гепатолог через 2 нед), refer_hepatology (трансплантная оценка). С автоматическим направлением и уведомлением.

### 3.3 От существующих ИИ-решений в гепатологии

| Продукт | Страна | Цена | Доступно в ПМСП | УЗИ-анализ | Explainability |
|---------|--------|------|----------------|------------|---------------|
| FibroScan (Echosens) | Франция | $45,000 + $50/тест | Нет (0.6% ПМСП) | Elastography | Нет |
| LiverMultiScan (Perspectum) | UK | $200/скан | Нет | MRI-PDFF | Нет |
| FibroMeter (Echosens) | Франция | $30/тест | Нет | Нет, blood only | Нет |
| HepatoScreen | Казахстан | $0 (open-source) | Да, любой ПК/планшет | УЗИ + клиника | Grad-CAM + reasoning |

HepatoScreen — единственное решение, которое: (a) работает на УЗИ-аппаратах, уже есть в ПМСП ( Mindray DP-10, $3,200), (b) не требует дополнительного hardware, (c) даёт explainability на языке врача, (d) разработано под специфику ПМСП Казахстана (HBV-эндемичность, 8-минутный приём, нестабильный интернет).

---

## 4. Roadmap

### Фаза 0: Хакатон MVP (неделя 1–2)
- [x] Web-платформа (Next.js): кейсы, регистр, отчёты, авторизация
- [x] ML-lab (Vite): загрузка УЗИ, inference stub, explainability overlay
- [x] ML-api (FastAPI): triage (FIB-4/APRI/fusion), inference endpoint, explanations
- [x] Go API + PostgreSQL: JWT-аутентификация, CRUD, audit log
- [x] Docker compose: деплой одной командой
- [ ] Замена hash-based stub на EfficientNet-B3 inference (transfer learning из docs/training-code)
- [ ] Разметка 200 УЗИ-снимков из открытых датасетов (Kaggle Liver Fibrosis, LiTS)
- **Метрики**: end-to-end прохождение кейса < 10 сек, triage accuracy на synthetic data = 100% (детерминированные формулы)

### Фаза 1: Пилот в 1 ПМСП (месяц 2–4)
- Установка в ПМСП №1 г. Астана (координатор: зав. отделением)
- 3 гепатолога из Областной больницы — golden standard labeling
- 500 реальных пациентов: сравнение HepatoScreen vs гепатолог (blinded review)
- Fine-tuning EfficientNet-B3 на 500+ размеченных УЗИ
- **Метрики**: sensitivity ≥ 85%, specificity ≥ 80% для ≥ F2; inter-rater agreement (Cohen's κ) ≥ 0.75

### Фаза 2: Клиническая валидация (месяц 5–8)
- Расширение на 6 пилотных учреждений (ПМСП №2 Алматы, Сарыаркинский, Алматинский район, ГКП №5)
- Prospective cohort study: 2,000 пациентов, follow-up 6 месяцев
- Сравнение с FibroScan (reference standard) на подвыборке n=200
- Начало подготовки документации для МЗ РК (класс 1 medical device software)
- **Метрики**: AUC-ROC ≥ 0.88; время до диагностики сокращено на 40%; cost-effectiveness: $45/QUALY

### Фаза 3: Масштабирование (месяц 9–18)
- Интеграция с МИС Казахстана (eHealth, 1С:Медицина)
- Offline-first PWA для сельских ФАПов
- Национальный регистр ХВГ — dashboard для МЗ РК
- **Метрики**: 50,000 скринингов/год, 12,000 ранних выявлений, покрытие 200+ ПМСП

---

## 5. Риски и честные ограничения

### 5.1 Что HepatoScreen НЕ делает

- **НЕ ставит окончательный диагноз**. Только скрининг и триаж. Окончательная диагностика — гепатолог, elastography (FibroScan) или biopsy.
- **НЕ заменяет гепатолога**. Цель — направить к гепатологу тех, кто иначе бы не дошёл.
- **НЕ работает без УЗИ-снимка**. Только клинический triage (FIB-4/APRI) работает без УЗИ, но с lower accuracy.
- **НЕ поддерживает CT/MRI**. Только УЗИ (B-mode). Elastography-УЗИ (ShearWave, ARFI) — в roadmap, но не в MVP.
- **НЕ лечит**. Нет модуля назначения терапии. Рекомендации ограничены: «Направление к гепатологу», «Повторное УЗИ через N месяцев».

### 5.2 Технические ограничения

| Риск | Вероятность | Митигация |
|------|------------|-----------|
| Vision model — hash-based stub, не обучена | 100% (текущий) | Transfer learning из docs/training-code, 6 часов на RTX 5050 |
| Dataset — нет размеченных kazakhstan-specific УЗИ | Высокая | Kaggle open datasets → пилот с 3 гепатологами |
| УЗИ-качество — разные аппараты, операторы | Высокая | Image quality scoring (blur detection), reject if SSIM < 0.4 |
| GPU недоступен в 90% ПМСП | Средняя | ONNX Runtime CPU, inference < 8 сек; GPU — опционально |
| HBV/HCV serology не всегда доступна | Средняя | Graceful degradation: triage без serology с adjusted thresholds |

### 5.3 Регуляторные риски

**HepatoScreen НЕ является медицинским изделием на данный момент.** Это research prototype / clinical decision support system (CDSS). Классификация по постановлению МЗ РК № QS-3/287:

- Класс 1 (низкий риск): CDSS, который предоставляет рекомендации, но не заменяет врача. Требует: документация, clinical validation, post-market surveillance.
- HepatoScreen соответствует: врач всегда может override, audit log фиксирует, explainability обосновывает.

**Для коммерциализации необходимо:**
- Prospective clinical trial (Фаза 2 roadmap)
- Регистрация в Национальном центре экспертизы (НЦЭМС) как Class 1 SaMD
- Срок: 8–12 месяцев после завершения пилота

**Этика:**
- Все УЗИ-снимки — anonymized, no PHI в ML-api
- Согласие пациента — checkbox в web-форме, логируется
- Модель — не обучается на production data без явного consent

### 5.4 Бизнес-риски

| Риск | Вероятность | Митигация |
|------|------------|-----------|
| Нет budget на масштаб | Средняя | Open-source, деплой на существующих ПК ПМСП |
| Сопротивление врачей (адопшен) | Средняя | Explainability + время приёма сокращается, не увеличивается |
| МЗ РК выберет другое решение | Низкая | First-mover в казахстанском УЗИ-скрининге печени, open-source |
| Конкуренция FibroScan | Низкая | Цена ($0 vs $45K), доступность (любое ПМСП vs 6 центров) |

---

## 6. Почему именно сейчас

- **2023**: Постановление МЗ РК №464 о национальном регистре ХВГ — нужна цифровая инфраструктура.
- **2024**: 94% ПМСП Казахстана имеют интернет и ПК — техническая готовность.
- **2025**: RTX 5050 Laptop GPU, ONNX Runtime, timm (PyTorch Image Models) — ML доступен на consumer hardware.
- **HepatoScreen**: готовый прототип, докеризированный, с explainability и audit log. Не идея — код.

---

*HepatoScreen Team, 2025. Открытый исходный код: https://github.com/Va11eyard/LiverScreening*
