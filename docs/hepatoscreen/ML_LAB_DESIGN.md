# ML Lab HepatoScreen — Design Document

> Версия: 1.0  
> Статус: Draft  
> Цель: Передизайн apps/ml-lab с выравниванием на apps/web (shadcn/ui + Tailwind CSS)  
> Аудитория: Frontend-разработчик, реализующий редизайн

---

## Содержание

1. [Общая концепция](#1-общая-концепция)
2. [Цветовая система](#2-цветовая-система)
3. [Типографика](#3-типографика)
4. [Layout и сетка](#4-layout-и-сетка)
5. [Компоненты](#5-компоненты)
   - 5.1 [MlLabHeader](#51-mllabheader)
   - 5.2 [MlLabTabs](#52-mllabtabs)
   - 5.3 [ClinicalForm](#53-clinicalform)
   - 5.4 [DropZone](#54-dropzone)
   - 5.5 [ResultCard](#55-resultcard)
   - 5.6 [ConfidenceMeter](#56-confidencemeter)
   - 5.7 [ExplainOverlay](#57-explainoverlay)
   - 5.8 [AnalysisSkeleton](#58-analysisskeleton)
   - 5.9 [ProgressIndicator](#59-progressindicator)
   - 5.10 [MlLabFooter](#510-mllabfooter)
6. [Анимации](#6-анимации)
7. [Адаптивность](#7-адаптивность)
8. [Accessibility (WCAG 2.1 AA)](#8-accessibility-wcag-21-aa)
9. [Dependencies](#9-dependencies)
10. [Migration Guide](#10-migration-guide)

---

## 1. Общая концепция

### 1.1 Философия

ML Lab — это **экспериментальная лаборатория**, не клинический интерфейс. Дизайн должен передавать ощущение:
- **Профессионализма** — выравнивание с клинической платформой `apps/web`
- **Экспериментальности** — это "лаборатория" для тестирования модели
- **Доверия** — медицинский SaaS, чистый и предсказуемый UX

### 1.2 Выравнивание с apps/web

| Аспект | apps/web (клиника) | apps/ml-lab (новый дизайн) |
|--------|-------------------|---------------------------|
| UI Kit | shadcn/ui | shadcn/ui (те же компоненты) |
| Styling | Tailwind CSS v4 | Tailwind CSS v4 |
| Icons | lucide-react | lucide-react |
| Typography | Inter | Inter |
| Cards | `Card` из shadcn | `Card` из shadcn |
| Badges | `Badge` из shadcn | `Badge` из shadcn |
| Buttons | `Button` из shadcn | `Button` из shadcn |
| Цвета | Медицинская палитра | Медицинская + ML-акценты |

### 1.3 ML-специфика vs клиника

Отличия от клинической платформы — акценты, которые делают ML Lab узнаваемым:

- **Header**: статус ML API с пульсирующим индикатором (не просто badge)
- **Цвет акцента**: teal (`#0d9488` → `teal-600`) сохраняем как бренд HepatoScreen
- **Upload zone**: drag-and-drop с визуальной обратной связью
- **Explainability**: side-by-side layout с анимированным SVG overlay
- **Risk tiers**: цветные badge с семантикой риска

---

## 2. Цветовая система

### 2.1 Базовая палитра (медицинский SaaS)

```
Background Primary:   #f8fafc  (slate-50)    — фон страницы
Background Secondary: #f1f5f9  (slate-100)   — фон секций
Card Background:      #ffffff  (white)       — карточки
Border:               #e2e8f0  (slate-200)   — границы
Border Focus:         #cbd5e1  (slate-300)   — фокусные границы

Text Primary:         #0f172a  (slate-900)   — основной текст
Text Secondary:       #475569  (slate-600)   — вторичный текст
Text Muted:           #64748b  (slate-500)   — подписи, hints
Text Placeholder:     #94a3b8  (slate-400)   — placeholder
```

### 2.2 Акцентные цвета (Teal — бренд HepatoScreen)

```
Accent Primary:       #0d9488  (teal-600)    — primary buttons, active tabs, links
Accent Hover:         #0f766e  (teal-700)    — hover состояние
Accent Light:         #ccfbf1  (teal-100)    — light backgrounds
Accent Subtle:        #f0fdfa  (teal-50)     — subtle highlights

Primary Button:       bg-teal-600 text-white hover:bg-teal-700
Primary Button Ghost: bg-teal-50 text-teal-700 hover:bg-teal-100
```

### 2.3 Risk Tier цвета (семантические)

| Tier | Название | Hex | Tailwind | Использование |
|------|----------|-----|----------|---------------|
| low | Низкий риск | `#16a34a` | `green-600` | F0-F1, fib4 < 1.3 |
| watch | Наблюдение | `#ca8a04` | `amber-600` | F1-F2, fib4 1.3-2.67 |
| urgent | Срочный | `#ea580c` | `orange-600` | F3, fib4 > 2.67 |
| refer_hepatology | Направление к гепатологу | `#dc2626` | `red-600` | F4, HBV+, decompensated |

Risk tier badge mapping:
```typescript
const riskTierConfig = {
  low:              { color: "green",  bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
  watch:            { color: "amber",  bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
  urgent:           { color: "orange", bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  refer_hepatology: { color: "red",    bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200" },
} as const;
```

### 2.4 ML-статус индикаторы

```
Status Online:  #22c55e (green-500)  — пульсирующая точка
Status Offline: #ef4444 (red-500)   — статичная точка
Status Pending: #94a3b8 (slate-400) — серый, анимация pulse
```

### 2.5 Цветовая схема форм

```
Input Background:     #ffffff (white)
Input Border:         #e2e8f0 (slate-200)
Input Border Focus:   #0d9488 (teal-600)  — ring-teal-500 ring-2
Input Error:          #ef4444 (red-500)   — border-red-500
Label Text:           #475569 (slate-600)
```

---

## 3. Типографика

### 3.1 Шрифт

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

### 3.2 Scale

| Элемент | Размер | Вес | Line-height | Tailwind |
|---------|--------|-----|-------------|----------|
| Page Title (h1) | 28px / 1.75rem | 700 | 1.2 | `text-3xl font-bold` |
| Card Title (h2) | 18px / 1.125rem | 600 | 1.3 | `text-lg font-semibold` |
| Section Title (h3) | 16px / 1rem | 600 | 1.4 | `text-base font-semibold` |
| Body | 14px / 0.875rem | 400 | 1.5 | `text-sm` |
| Body Small | 13px / 0.8125rem | 400 | 1.5 | `text-[13px]` |
| Caption | 12px / 0.75rem | 500 | 1.4 | `text-xs font-medium` |
| Eyebrow | 12px / 0.75rem | 600 | 1.2 | `text-xs font-semibold uppercase tracking-wider` |

### 3.3 Eyebrow (паттерн из apps/web)

```tsx
<p className="text-xs font-semibold uppercase tracking-wider text-teal-600 mb-1">
  Прототип · отдельный контур
</p>
```

---

## 4. Layout и сетка

### 4.1 Page Container

```tsx
<div className="min-h-screen bg-slate-50">
  <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">
    {/* content */}
  </div>
</div>
```

### 4.2 Grid система

**Desktop (≥1024px):** 2 колонки — форма слева, результат справа  
**Tablet (768–1023px):** 1 колонка, explainability side-by-side  
**Mobile (<768px):** 1 колонка, stacked

```tsx
// Desktop layout
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <div>{/* Form Card */}</div>
  <div>{/* Result Card */}</div>
</div>
```

### 4.3 Spacing scale

```
Section gap:     24px (gap-6)
Card padding:    24px (p-6)
Card gap:        16px (gap-4)
Form field gap:  12px (gap-3)
Inner element:   8px  (gap-2 / space-y-2)
Micro:           4px  (gap-1)
```

---

## 5. Компоненты

### 5.1 MlLabHeader

**Назначение**: Шапка страницы с branding и статусом ML API.

**Props:**
```typescript
interface MlLabHeaderProps {
  online: boolean;        // статус ML API
  apiUrl: string;         // отображаемый URL API
}
```

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ [EYEBROW: Прототип · отдельный контур]          [● Online] │
│ [H1: HepatoScreen ML Lab]                        ML API     │
│ [subtitle: Загрузка УЗИ и тестирование модели...]          │
└─────────────────────────────────────────────────────────────┘
```

**JSX:**
```tsx
<header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
  <div>
    <p className="text-xs font-semibold uppercase tracking-wider text-teal-600 mb-1">
      Прототип · отдельный контур
    </p>
    <h1 className="text-3xl font-bold text-slate-900 mb-1">
      HepatoScreen ML Lab
    </h1>
    <p className="text-sm text-slate-500">
      Загрузка УЗИ и тестирование модели без клинического регистра
    </p>
  </div>
  
  <div 
    className="flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1.5 shrink-0"
    aria-label={`ML API статус: ${online ? "онлайн" : "офлайн"}`}
  >
    <span className={cn(
      "relative flex h-2.5 w-2.5",
      online && "animate-pulse"
    )}>
      <span className={cn(
        "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
        online ? "bg-green-400" : "bg-transparent"
      )} />
      <span className={cn(
        "relative inline-flex rounded-full h-2.5 w-2.5",
        online ? "bg-green-500" : "bg-red-500"
      )} />
    </span>
    <span className="font-medium">{online ? "online" : "offline"}</span>
  </div>
</header>
```

**Примечания:**
- Пульсирующая точка — `animate-ping` на зелёном фоне при online
- Offline — красная точка без анимации
- `aria-label` на контейнере для screen readers

---

### 5.2 MlLabTabs

**Назначение**: Переключение между режимами "УЗИ + клиника" и "Только FIB-4 / APRI".

**Props:**
```typescript
interface MlLabTabsProps {
  activeTab: "clinical" | "full";
  onTabChange: (tab: "clinical" | "full") => void;
}
```

**JSX:**
```tsx
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stethoscope, Microscope } from "lucide-react";

<Tabs value={activeTab} onValueChange={(v) => onTabChange(v as Tab)} className="mb-6">
  <TabsList className="grid w-full grid-cols-2 h-11">
    <TabsTrigger value="full" className="gap-2">
      <Microscope className="h-4 w-4" aria-hidden="true" />
      <span>УЗИ + клиника</span>
    </TabsTrigger>
    <TabsTrigger value="clinical" className="gap-2">
      <Stethoscope className="h-4 w-4" aria-hidden="true" />
      <span>Только FIB-4 / APRI</span>
    </TabsTrigger>
  </TabsList>
</Tabs>
```

**Иконки:**
- `Microscope` → режим full (УЗИ + клиника) — символизирует глубокий анализ
- `Stethoscope` → режим clinical (только скоринг) — символизирует клиническую оценку

**Accessibility:**
- `aria-hidden="true"` на иконках (декоративные)
- Tabs из shadcn управляет `role="tablist"`, `role="tab"`, `aria-selected` автоматически

---

### 5.3 ClinicalForm

**Назначение**: Форма ввода клинических данных.

**Props:**
```typescript
interface ClinicalFormProps {
  values: {
    age: string;
    ast: string;
    alt: string;
    platelets: string;
    etiology: string;
    hbv: boolean;
  };
  onChange: (field: string, value: string | boolean) => void;
  onSubmit: (e: FormEvent) => void;
  loading: boolean;
  error: string;
  tab: "clinical" | "full";
  file: File | null;
  onFileChange: (file: File | null) => void;
  preview: string | null;
}
```

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ Card                                           │
│ ┌──────────────┐ ┌──────────────┐              │
│ │ Возраст      │ │ АСТ          │              │
│ │ [52        ] │ │ [65        ] │              │
│ └──────────────┘ └──────────────┘              │
│ ┌──────────────┐ ┌──────────────┐              │
│ │ АЛТ          │ │ Тромбоциты   │              │
│ │ [70        ] │ │ [180       ] │              │
│ └──────────────┘ └──────────────┘              │
│ ┌──────────────────────────────┐               │
│ │ Этиология                    │               │
│ │ [MASLD/НАЖБП              ] │               │
│ └──────────────────────────────┘               │
│ [☑] ХВГ+                                       │
│ ─────────────────────────────────              │
│ [     Зона drag-and-drop УЗИ    ]  ← только full│
│ [Запустить модель] / [Анализ…]                 │
│ [❌ Ошибка сообщение]                          │
└─────────────────────────────────────────────────┘
```

**JSX — поля формы:**
```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

<Card className="shadow-sm border-slate-200">
  <CardHeader className="pb-4">
    <CardTitle className="text-lg font-semibold text-slate-900">
      Клинические данные
    </CardTitle>
  </CardHeader>
  <CardContent>
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Grid 2 колонки */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Возраст */}
        <div className="space-y-1.5">
          <Label htmlFor="age" className="text-sm font-medium text-slate-600">
            Возраст
          </Label>
          <Input
            id="age"
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="h-10 focus-visible:ring-teal-500 focus-visible:ring-2"
            aria-required="true"
          />
        </div>

        {/* АСТ */}
        <div className="space-y-1.5">
          <Label htmlFor="ast" className="text-sm font-medium text-slate-600">
            АСТ, U/L
          </Label>
          <Input
            id="ast"
            type="number"
            value={ast}
            onChange={(e) => setAst(e.target.value)}
            className="h-10 focus-visible:ring-teal-500 focus-visible:ring-2"
            aria-required="true"
          />
        </div>

        {/* АЛТ */}
        <div className="space-y-1.5">
          <Label htmlFor="alt" className="text-sm font-medium text-slate-600">
            АЛТ, U/L
          </Label>
          <Input
            id="alt"
            type="number"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            className="h-10 focus-visible:ring-teal-500 focus-visible:ring-2"
            aria-required="true"
          />
        </div>

        {/* Тромбоциты */}
        <div className="space-y-1.5">
          <Label htmlFor="platelets" className="text-sm font-medium text-slate-600">
            Тромбоциты, ×10⁹/L
          </Label>
          <Input
            id="platelets"
            type="number"
            value={platelets}
            onChange={(e) => setPlatelets(e.target.value)}
            className="h-10 focus-visible:ring-teal-500 focus-visible:ring-2"
            aria-required="true"
          />
        </div>
      </div>

      {/* Этиология — full width */}
      <div className="space-y-1.5">
        <Label htmlFor="etiology" className="text-sm font-medium text-slate-600">
          Этиология
        </Label>
        <Input
          id="etiology"
          type="text"
          value={etiology}
          onChange={(e) => setEtiology(e.target.value)}
          className="h-10 focus-visible:ring-teal-500 focus-visible:ring-2"
          placeholder="Например: MASLD/НАЖБП"
        />
      </div>

      {/* ХВГ+ checkbox */}
      <div className="flex items-center space-x-2 pt-1">
        <Checkbox
          id="hbv"
          checked={hbv}
          onCheckedChange={(checked) => setHbv(checked as boolean)}
          className="border-slate-300 data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600"
        />
        <Label htmlFor="hbv" className="text-sm font-medium text-slate-700 cursor-pointer">
          ХВГ+ (хронический гепатит B)
        </Label>
      </div>

      {/* DropZone — только для full tab */}
      {tab === "full" && (
        <DropZone
          file={file}
          preview={preview}
          onFileChange={onFileChange}
        />
      )}

      {/* Submit button */}
      <Button
        type="submit"
        disabled={loading}
        className="w-full h-11 bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors"
        aria-label={loading ? "Анализ выполняется" : "Запустить модель"}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Анализ…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Play className="h-4 w-4" aria-hidden="true" />
            Запустить модель
          </span>
        )}
      </Button>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-500" aria-hidden="true" />
          <AlertDescription className="text-red-700 text-sm">
            {error}
          </AlertDescription>
        </Alert>
      )}
    </form>
  </CardContent>
</Card>
```

---

### 5.4 DropZone

**Назначение**: Drag-and-drop зона для загрузки УЗИ-снимков.

**Props:**
```typescript
interface DropZoneProps {
  file: File | null;
  preview: string | null;  // object URL для preview
  onFileChange: (file: File | null) => void;
  accept?: string;         // default: "image/*"
  maxSizeMB?: number;      // default: 10
}
```

**Состояния:**
1. **Empty** — иконка, текст "Перетащите УЗИ-снимок", подпись "или нажмите для выбора"
2. **DragOver** — рамка становится teal, фон teal-50
3. **HasFile** — показывается thumbnail + имя файла + кнопка удаления
4. **Error** — превышен размер или неверный формат

**JSX:**
```tsx
import { Upload, X, FileImage, AlertTriangle } from "lucide-react";

export function DropZone({ file, preview, onFileChange, accept = "image/*", maxSizeMB = 10 }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    validateAndSet(dropped);
  };

  const validateAndSet = (f: File | undefined) => {
    if (!f) return;
    if (f.size > maxSizeMB * 1024 * 1024) {
      setSizeError(true);
      return;
    }
    setSizeError(false);
    onFileChange(f);
  };

  return (
    <div className="space-y-2">
      {file && preview ? (
        /* State: HasFile — preview + remove */
        <div className="relative rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-3">
            <div className="relative w-16 h-16 rounded-md overflow-hidden border border-slate-200 shrink-0">
              <img
                src={preview}
                alt={`Загруженный снимок: ${file.name}`}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">
                {file.name}
              </p>
              <p className="text-xs text-slate-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={() => onFileChange(null)}
              className="p-1.5 rounded-md hover:bg-slate-200 transition-colors"
              aria-label="Удалить загруженный файл"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>
      ) : (
        /* State: Empty — drop zone */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200",
            isDragOver
              ? "border-teal-500 bg-teal-50 text-teal-700"
              : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
          )}
          role="button"
          tabIndex={0}
          aria-label="Зона загрузки УЗИ-снимка. Перетащите файл или нажмите Enter для выбора."
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className={cn(
              "p-3 rounded-full transition-colors",
              isDragOver ? "bg-teal-100" : "bg-slate-100"
            )}>
              <Upload className={cn(
                "h-6 w-6",
                isDragOver ? "text-teal-600" : "text-slate-400"
              )} aria-hidden="true" />
            </div>
            <div>
              <p className={cn(
                "text-sm font-medium",
                isDragOver ? "text-teal-700" : "text-slate-700"
              )}>
                {isDragOver ? "Отпустите для загрузки" : "Перетащите УЗИ-снимок"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                PNG, JPG, DICOM до {maxSizeMB} MB
              </p>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={(e) => validateAndSet(e.target.files?.[0])}
            className="sr-only"
            aria-label="Выбор файла УЗИ"
          />
        </div>
      )}

      {/* Size error */}
      {sizeError && (
        <div className="flex items-center gap-2 text-red-600 text-xs">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Файл превышает {maxSizeMB} MB</span>
        </div>
      )}
    </div>
  );
}
```

**Accessibility:**
- `role="button"` и `tabIndex={0}` на drop zone
- `aria-label` описывает действие
- `onKeyDown` для Enter/Space
- `.sr-only` на `<input>` — скрыт визуально, доступен для screen reader
- Изображение в preview имеет `alt` с именем файла

---

### 5.5 ResultCard

**Назначение**: Карточка результата анализа. Заменяет `<pre class="json">`.

**Props:**
```typescript
interface ResultCardProps {
  result: InferenceResult;
  onShowExplain?: () => void;  // callback для открытия explainability
  hasExplainability: boolean;
}

// InferenceResult из api.ts:
// {
//   stage: string;        // e.g. "F3"
//   confidence: string;   // e.g. "0.87"
//   fib4: string;         // e.g. "2.34"
//   apri: string;         // e.g. "0.89"
//   risk_tier: string;    // e.g. "high"
//   pre_diag: string;
//   plus_disease: string;
//   zone: string;
//   rop_form: string;
// }
```

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Card — Результат анализа                                     │
│ ┌─────────────────────────────────────────────────────┐     │
│ │ [🟡] УМЕРЕННЫЙ РИСК      Fibrosis Stage: F2         │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                              │
│ ┌──────────────────────┐  ┌──────────────────────┐         │
│ │ FIB-4                │  │ APRI                 │         │
│ │ 2.34                 │  │ 0.89                 │         │
│ │ [████████░░░░]       │  │ [██████░░░░░░]       │         │
│ │ Значительное фиброза │  │ Умеренная фиброза    │         │
│ └──────────────────────┘  └──────────────────────┘         │
│                                                              │
│ ┌──────────────────────┐  ┌──────────────────────┐         │
│ │ Confidence           │  │ Stage                │         │
│ │ 87%                  │  │ F2                   │         │
│ │ [██████████░░░]      │  │ Умеренная фиброза    │         │
│ └──────────────────────┘  └──────────────────────┘         │
│                                                              │
│ ┌─────────────────────────────────────────────────────┐     │
│ │ Диагностика: Хронический гепатит, стадия фиброза F2 │     │
│ │ Зона: III  Plus: +   ROP: активная                  │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                              │
│ [Показать объяснение ИИ]  ← если explanation доступен      │
└─────────────────────────────────────────────────────────────┘
```

**JSX:**
```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Brain, TrendingUp, Activity, BarChart3 } from "lucide-react";

export function ResultCard({ result, onShowExplain, hasExplainability }: ResultCardProps) {
  const tier = parseRiskTier(result.risk_tier);
  const confidence = parseFloat(result.confidence) * 100;
  const fib4 = parseFloat(result.fib4);
  const apri = parseFloat(result.apri);

  return (
    <Card className="shadow-sm border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900">
            Результат анализа
          </CardTitle>
          <RiskTierBadge tier={tier} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* FIB-4 */}
          <MetricBox
            icon={<TrendingUp className="h-4 w-4 text-teal-600" />}
            label="FIB-4"
            value={result.fib4}
            progress={normalizeFib4(fib4)}
            interpretation={interpretFib4(fib4)}
          />

          {/* APRI */}
          <MetricBox
            icon={<Activity className="h-4 w-4 text-teal-600" />}
            label="APRI"
            value={result.apri}
            progress={normalizeApri(apri)}
            interpretation={interpretApri(apri)}
          />

          {/* Confidence */}
          <MetricBox
            icon={<BarChart3 className="h-4 w-4 text-teal-600" />}
            label="Confidence"
            value={`${confidence.toFixed(0)}%`}
            progress={confidence}
            interpretation={interpretConfidence(confidence)}
          />

          {/* Stage */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-600" aria-hidden="true" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Stage
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{result.stage}</p>
            <StageBar stage={result.stage} />
          </div>
        </div>

        {/* Diagnosis summary */}
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-4 space-y-2">
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-700">Предварительный диагноз:</span>{" "}
            {result.pre_diag}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Зона: <span className="font-medium text-slate-700">{result.zone}</span></span>
            <span>Plus: <span className="font-medium text-slate-700">{result.plus_disease}</span></span>
            <span>ROP: <span className="font-medium text-slate-700">{result.rop_form}</span></span>
          </div>
        </div>

        {/* Explain button */}
        {hasExplainability && onShowExplain && (
          <Button
            variant="outline"
            onClick={onShowExplain}
            className="w-full h-10 border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800 transition-colors"
          >
            <Brain className="h-4 w-4 mr-2" aria-hidden="true" />
            Показать объяснение ИИ
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

**RiskTierBadge:**
```tsx
function RiskTierBadge({ tier }: { tier: "low" | "watch" | "urgent" | "refer_hepatology" }) {
  const config = {
    low:              { label: "НИЗКИЙ РИСК",            className: "bg-green-100 text-green-700 border-green-200 hover:bg-green-100" },
    watch:            { label: "НАБЛЮДЕНИЕ",             className: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100" },
    urgent:           { label: "СРОЧНЫЙ",                className: "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100" },
    refer_hepatology: { label: "НАПРАВЛЕНИЕ К ГЕПАТОЛОГУ", className: "bg-red-100 text-red-700 border-red-200 hover:bg-red-100" },
  };

  const c = config[tier];
  return (
    <Badge variant="outline" className={cn("font-semibold text-xs px-2.5 py-0.5", c.className)}>
      {c.label}
    </Badge>
  );
}
```

**MetricBox:**
```tsx
function MetricBox({ icon, label, value, progress, interpretation }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  progress: number;
  interpretation: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <Progress value={Math.min(progress, 100)} className="h-1.5" />
      <p className="text-xs text-slate-500">{interpretation}</p>
    </div>
  );
}
```

**StageBar (F0-F4 визуализация):**
```tsx
function StageBar({ stage }: { stage: string }) {
  const stages = ["F0", "F1", "F2", "F3", "F4"];
  const activeIdx = stages.indexOf(stage.toUpperCase());

  return (
    <div className="flex gap-1" role="img" aria-label={`Стадия фиброза: ${stage}`}>
      {stages.map((s, i) => (
        <div
          key={s}
          className={cn(
            "h-2 flex-1 rounded-full transition-colors",
            i <= activeIdx && activeIdx >= 0
              ? i <= 1 ? "bg-green-400" : i === 2 ? "bg-yellow-400" : i === 3 ? "bg-orange-400" : "bg-red-400"
              : "bg-slate-200"
          )}
        />
      ))}
    </div>
  );
}
```

**Утилиты:**
```typescript
function parseRiskTier(tier: string): "low" | "watch" | "urgent" | "refer_hepatology" {
  const map: Record<string, "low" | "watch" | "urgent" | "refer_hepatology"> = {
    low: "low", watch: "watch", urgent: "urgent", refer_hepatology: "refer_hepatology",
  };
  return map[tier.toLowerCase()] ?? "watch";
}

function normalizeFib4(val: number): number {
  return Math.min((val / 5) * 100, 100); // нормализация: 5.0 = 100%
}

function normalizeApri(val: number): number {
  return Math.min((val / 3) * 100, 100); // нормализация: 3.0 = 100%
}

function interpretFib4(val: number): string {
  if (val < 1.3) return "Незначительная фиброза";
  if (val < 2.67) return "Значительная фиброза";
  return "Тяжёлая фиброза / цирроз";
}

function interpretApri(val: number): string {
  if (val < 0.5) return "Незначительная фиброза";
  if (val < 1.0) return "Умеренная фиброза";
  if (val < 2.0) return "Значительная фиброза";
  return "Тяжёлая фиброза / цирроз";
}

function interpretConfidence(val: number): string {
  if (val >= 90) return "Очень высокая";
  if (val >= 70) return "Высокая";
  if (val >= 50) return "Средняя";
  return "Низкая — требуется врачебная оценка";
}
```

---

### 5.6 ConfidenceMeter

**Назначение**: Визуальный индикатор уверенности модели (дополнительный к Progress).

**Props:**
```typescript
interface ConfidenceMeterProps {
  value: number;  // 0–100
  size?: "sm" | "md" | "lg";  // default: "md"
  showLabel?: boolean;  // default: true
}
```

**JSX:**
```tsx
export function ConfidenceMeter({ value, size = "md", showLabel = true }: ConfidenceMeterProps) {
  const sizes = { sm: "h-1.5", md: "h-2.5", lg: "h-4" };
  const color = value >= 80 ? "bg-green-500" : value >= 60 ? "bg-yellow-500" : value >= 40 ? "bg-orange-500" : "bg-red-500";

  return (
    <div className="space-y-1.5" role="meter" aria-label={`Уверенность модели: ${value.toFixed(0)} процентов`}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className={cn("w-full rounded-full bg-slate-200 overflow-hidden", sizes[size])}>
        <div
          className={cn("rounded-full transition-all duration-1000 ease-out", color)}
          style={{ width: `${value}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-slate-500 text-right">{value.toFixed(0)}%</p>
      )}
    </div>
  );
}
```

---

### 5.7 ExplainOverlay

**Назначение**: Explainability-оверлей на УЗИ + панель объяснения.

**Props:**
```typescript
interface ExplainOverlayProps {
  imageUrl: string;
  region?: { cx: number; cy: number; rx: number; ry: number };
  explanation?: {
    title?: string;
    summary?: string;
    reasoning?: string[];
    recommendation?: string;
  };
  active: boolean;
  onClose?: () => void;
}
```

**Layout:**
```
Desktop (≥1024px):
┌──────────────────────────────────────────────────────────────┐
│ ExplainOverlay                                               │
│ ┌──────────────────────────┐  ┌────────────────────────────┐ │
│ │                          │  │ Объяснение ИИ              │ │
│ │   [УЗИ изображение]      │  │ ━━━━━━━━━━━━━━━━━━━━━━━━   │ │
│ │                          │  │ Гетерогенная эхотекстура   │ │
│ │   ╭──────────────╮       │  │ с повышенной эхогенностью  │ │
│ │   │  Пульсирующий │       │  │ в правой доле печени.      │ │
│ │   │   овал        │       │  │                            │ │
│ │   ╰──────────────╯       │  │ Рассуждение:               │ │
│ │                          │  │ ✓ Повышенная эхогенность   │ │
│ │                          │  │ ⚠ Неровные контуры         │ │
│ │                          │  │ ✓ Утолщение стенок         │ │
│ │                          │  │                            │ │
│ │                          │  │ ┌────────────────────────┐ │ │
│ │                          │  │ │ Рекомендация:          │ │ │
│ │                          │  │ │ Консультация гепатолога│ │ │
│ │                          │  │ └────────────────────────┘ │ │
│ └──────────────────────────┘  └────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

Mobile (<768px): stacked — изображение сверху, explanation снизу
```

**JSX:**
```tsx
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExplainOverlay({ imageUrl, region, explanation, active, onClose }: ExplainOverlayProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const r = region ?? { cx: 0.62, cy: 0.45, rx: 0.18, ry: 0.22 };

  useEffect(() => {
    if (!active) {
      setShowDialog(false);
      return;
    }
    const t = window.setTimeout(() => setShowDialog(true), 600); // быстрее чем 900ms
    return () => window.clearTimeout(t);
  }, [active]);

  if (!active) return null;

  return (
    <div className="mt-6 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left: Image with SVG overlay */}
        <div className="relative flex-1 min-w-0 lg:max-w-[55%]">
          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
            <img
              src={imageUrl}
              alt="УЗИ печени с выделенной зоной интереса"
              className={cn(
                "w-full h-auto object-contain transition-opacity duration-300",
                imageLoaded ? "opacity-100" : "opacity-0"
              )}
              onLoad={() => setImageLoaded(true)}
            />
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-8 w-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <ellipse
                className="explain-region-draw"
                cx={r.cx}
                cy={r.cy}
                rx={r.rx}
                ry={r.ry}
                fill="none"
                stroke="#0d9488"
                strokeWidth="0.004"
              />
              <ellipse
                className="explain-region-pulse"
                cx={r.cx}
                cy={r.cy}
                rx={r.rx * 1.05}
                ry={r.ry * 1.05}
                fill="none"
                stroke="#0d9488"
                strokeWidth="0.002"
                opacity="0.5"
              />
            </svg>
          </div>
        </div>

        {/* Right: Explanation panel */}
        {showDialog && explanation && (
          <div
            className="flex-1 animate-in fade-in slide-in-from-right-4 duration-500 lg:max-w-[45%]"
            role="region"
            aria-label="Объяснение решения модели"
          >
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
              {/* Header */}
              <div className="flex items-start justify-between">
                <h3 className="text-base font-semibold text-slate-900">
                  {explanation.title ?? "Объяснение ИИ"}
                </h3>
                {onClose && (
                  <button
                    onClick={onClose}
                    className="p-1 rounded-md hover:bg-slate-100 transition-colors"
                    aria-label="Закрыть объяснение"
                  >
                    <X className="h-4 w-4 text-slate-400" />
                  </button>
                )}
              </div>

              {/* Summary */}
              <p className="text-sm text-slate-600 leading-relaxed">
                {explanation.summary}
              </p>

              {/* Reasoning list */}
              {explanation.reasoning && explanation.reasoning.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Рассуждение модели
                  </p>
                  <ul className="space-y-2">
                    {explanation.reasoning.map((line, i) => {
                      const isRisk = line.toLowerCase().includes("риск") ||
                                     line.toLowerCase().includes(" abnormal") ||
                                     line.toLowerCase().includes(" повышен") ||
                                     line.toLowerCase().includes(" нарушен");
                      return (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          {isRisk ? (
                            <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" aria-hidden="true" />
                          )}
                          <span className={isRisk ? "text-orange-800" : "text-slate-700"}>
                            {line}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Recommendation */}
              {explanation.recommendation && (
                <div className="rounded-lg bg-teal-50 border border-teal-100 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-teal-600" aria-hidden="true" />
                    <p className="text-sm font-semibold text-teal-800">
                      Рекомендация
                    </p>
                  </div>
                  <p className="text-sm text-teal-700 leading-relaxed">
                    {explanation.recommendation}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**CSS анимации (добавить в globals.css):**
```css
@keyframes explain-draw {
  from {
    stroke-dasharray: 0, 1000;
    stroke-dashoffset: 0;
  }
  to {
    stroke-dasharray: 1000, 0;
    stroke-dashoffset: 0;
  }
}

@keyframes explain-pulse {
  0%, 100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.03);
  }
}

.explain-region-draw {
  animation: explain-draw 1.2s ease-out forwards;
  transform-origin: center;
}

.explain-region-pulse {
  animation: explain-pulse 2s ease-in-out infinite;
  transform-origin: center;
}
```

---

### 5.8 AnalysisSkeleton

**Назначение**: Skeleton loader во время анализа УЗИ.

**Props:**
```typescript
interface AnalysisSkeletonProps {
  variant?: "form" | "result" | "full";  // default: "full"
}
```

**JSX:**
```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function AnalysisSkeleton({ variant = "full" }: AnalysisSkeletonProps) {
  if (variant === "result") {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-slate-100 p-3 space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-1.5 w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Full variant
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-teal-600 animate-spin" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-600">Анализ УЗИ-снимка…</span>
          </div>
          <Skeleton className="h-2 w-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

### 5.9 ProgressIndicator

**Назначение**: Прогресс-индикатор для длительного анализа (> 2 секунд).

**Props:**
```typescript
interface ProgressIndicatorProps {
  progress: number;       // 0–100
  status: string;         // текст статуса
  elapsedMs: number;      // прошедшее время
}
```

**JSX:**
```tsx
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";

export function ProgressIndicator({ progress, status, elapsedMs }: ProgressIndicatorProps) {
  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <div className="rounded-lg bg-white border border-slate-200 p-4 space-y-3 shadow-sm"
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
      aria-label={`Прогресс анализа: ${progress}%`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-teal-600 animate-spin" aria-hidden="true" />
          <span className="text-sm font-medium text-slate-700">{status}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Clock className="h-3 w-3" aria-hidden="true" />
          <span>{seconds}s</span>
        </div>
      </div>
      <Progress value={progress} className="h-2" />
      <p className="text-xs text-slate-500">
        {progress < 30 && "Загрузка изображения…"}
        {progress >= 30 && progress < 60 && "Предобработка снимка…"}
        {progress >= 60 && progress < 90 && "Инференс модели…"}
        {progress >= 90 && "Формирование результата…"}
      </p>
    </div>
  );
}
```

---

### 5.10 MlLabFooter

**Назначение**: Футер с навигационными ссылками.

**JSX:**
```tsx
<footer className="mt-8 pt-6 border-t border-slate-200 text-center">
  <p className="text-xs text-slate-500">
    Клинические кейсы и регистр — на{" "}
    <a
      href="http://localhost:3004"
      target="_blank"
      rel="noopener noreferrer"
      className="text-teal-600 hover:text-teal-700 font-medium underline underline-offset-2 transition-colors"
    >
      localhost:3004
    </a>
    . Обучение модели — позже на GPU (RTX 5050).
  </p>
</footer>
```

---

## 6. Анимации

### 6.1 Tailwind animate classes

| Анимация | Класс | Применение |
|----------|-------|------------|
| Fade in | `animate-in fade-in duration-500` | Появление ResultCard |
| Slide up | `animate-in fade-in slide-in-from-bottom-4 duration-500` | Появление карточки результата |
| Slide right | `animate-in fade-in slide-in-from-right-4 duration-500` | Появление explanation панели |
| Pulse | `animate-pulse` | ML API статус (online) |
| Ping | `animate-ping` | Пульсация статус-индикатора |
| Spin | `animate-spin` | Loader иконки |
| Progress bar | `transition-all duration-1000 ease-out` | ConfidenceMeter заполнение |

### 6.2 Кастомные keyframes (globals.css)

```css
@keyframes explain-draw {
  from {
    stroke-dasharray: 0, 1000;
    stroke-dashoffset: 0;
  }
  to {
    stroke-dasharray: 1000, 0;
    stroke-dashoffset: 0;
  }
}

@keyframes explain-pulse {
  0%, 100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.03);
  }
}

/* Result card entrance */
@keyframes result-enter {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Staggered children */
@keyframes stagger-fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Drop zone drag feedback */
@keyframes drag-pulse {
  0%, 100% {
    border-color: #0d9488;
    background-color: #f0fdfa;
  }
  50% {
    border-color: #14b8a6;
    background-color: #ccfbf1;
  }
}
```

### 6.3 Timing

| Элемент | Delay | Duration | Easing |
|---------|-------|----------|--------|
| ResultCard появление | 0ms | 500ms | ease-out |
| Explain dialog | 600ms | 500ms | ease-out |
| SVG region draw | 0ms | 1200ms | ease-out |
| SVG region pulse | 0ms | 2000ms | infinite ease-in-out |
| Progress bar fill | 0ms | 1000ms | ease-out |
| Skeleton pulse | 0ms | 2000ms | infinite ease-in-out |
| Confidence meter | 200ms | 1000ms | ease-out |

---

## 7. Адаптивность

### 7.1 Breakpoints

```
Mobile:   <  640px  (sm)
Tablet:   ≥  640px  (sm) — 1023px
Desktop:  ≥ 1024px  (lg)
Wide:     ≥ 1280px  (xl)
```

### 7.2 Layout по breakpoint'ам

#### Mobile (< 640px)
```
┌─────────────────────────────┐
│ Header (stacked)            │
│ [Eyebrow]                   │
│ [Title]                     │
│ [Subtitle]                  │
│ [Status badge]              │
├─────────────────────────────┤
│ Tabs (full width)           │
├─────────────────────────────┤
│ Form Card                   │
│ [inputs stacked 1 col]      │
│ [DropZone full width]       │
│ [Submit button]             │
├─────────────────────────────┤
│ Result Card (if present)    │
│ [metrics 2 cols]            │
│ [stage bar]                 │
├─────────────────────────────┤
│ Explain (stacked)           │
│ [Image full width]          │
│ [Explanation full width]    │
├─────────────────────────────┤
│ Footer                      │
└─────────────────────────────┘
```

#### Tablet (640–1023px)
```
┌─────────────────────────────────────┐
│ Header (row)              [Status]  │
├─────────────────────────────────────┤
│ Tabs                                │
├─────────────────────────────────────┤
│ Form Card (full width)              │
├─────────────────────────────────────┤
│ Result Card (full width)            │
├─────────────────────────────────────┤
│ Explain (side-by-side)              │
│ [Image 50%] [Explanation 50%]       │
├─────────────────────────────────────┤
│ Footer                              │
└─────────────────────────────────────┘
```

#### Desktop (≥ 1024px)
```
┌─────────────────────────────────────────────────────┐
│ Header (row)                              [Status]  │
├─────────────────────────────────────────────────────┤
│ Tabs                                                │
├──────────────────────────┬──────────────────────────┤
│ Form Card                │ Result Card              │
│ [grid 2 cols inputs]     │ [RiskTierBadge]          │
│ [DropZone]               │ [FIB-4 | APRI]           │
│ [Submit]                 │ [Confidence | Stage]     │
│                          │ [Diagnosis]              │
│                          │ [Explain button]         │
├──────────────────────────┴──────────────────────────┤
│ ExplainOverlay (full width, side-by-side)           │
│ [Image 55%] [Explanation 45%]                       │
├─────────────────────────────────────────────────────┤
│ Footer                                              │
└─────────────────────────────────────────────────────┘
```

### 7.3 Responsive Tailwind

```tsx
// Page container
<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">

// Header
<header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

// Main grid (form + result)
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

// ExplainOverlay
<div className="flex flex-col lg:flex-row gap-4">
  <div className="flex-1 min-w-0 lg:max-w-[55%]">
  <div className="flex-1 lg:max-w-[45%]">

// Form inputs
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

// Result metrics
<div className="grid grid-cols-2 gap-3">

// Tabs
<TabsList className="grid w-full grid-cols-2 h-11">
```

---

## 8. Accessibility (WCAG 2.1 AA)

### 8.1 Color Contrast

| Элемент | Цвет | Фон | Контраст | AA |
|---------|------|-----|----------|-----|
| Body text | `#0f172a` | `#f8fafc` | 15.8:1 | ✅ |
| Secondary text | `#475569` | `#f8fafc` | 7.2:1 | ✅ |
| Muted text | `#64748b` | `#f8fafc` | 5.5:1 | ✅ |
| Primary button | `#ffffff` | `#0d9488` | 4.6:1 | ✅ |
| Teal eyebrow | `#0d9488` | `#f8fafc` | 4.5:1 | ✅ |
| Green badge text | `#15803d` | `#dcfce7` | 5.8:1 | ✅ |
| Yellow badge text | `#a16207` | `#fef9c3` | 5.1:1 | ✅ |
| Orange badge text | `#c2410c` | `#ffedd5` | 5.3:1 | ✅ |
| Red badge text | `#b91c1c` | `#fee2e2` | 6.5:1 | ✅ |

### 8.2 Keyboard Navigation

| Элемент | Focus | Enter/Space | Tab |
|---------|-------|-------------|-----|
| Tabs | `focus-visible:ring-2 ring-teal-500` | Активация таба | Да |
| Inputs | `focus-visible:ring-2 ring-teal-500` | — | Да |
| Checkbox | `focus-visible:ring-2 ring-teal-500` | Toggle | Да |
| DropZone | `focus-visible:ring-2 ring-teal-500` | Открыть файл | Да |
| Submit button | `focus-visible:ring-2 ring-teal-500` | Submit | Да |
| Explain button | `focus-visible:ring-2 ring-teal-500` | Открыть overlay | Да |
| Close button | `focus-visible:ring-2 ring-slate-400` | Закрыть | Да |

### 8.3 ARIA attributes

```tsx
// ML API статус
<div role="status" aria-live="polite" aria-label={`ML API: ${online ? "online" : "offline"}`}>

// Risk tier badge
<Badge role="note" aria-label={`Уровень риска: ${tierLabel}`}>

// Confidence meter
<div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={confidence} aria-label={`Уверенность: ${confidence}%`}>

// Progress indicator
<div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>

// Explain overlay
<div role="region" aria-label="Объяснение решения модели">

// Drop zone
<div role="button" tabIndex={0} aria-label="Зона загрузки УЗИ-снимка">

// Stage bar
<div role="img" aria-label={`Стадия фиброза: ${stage}`}>

// Error alert
<Alert role="alert" aria-live="assertive">

// Loading
<Loader2 aria-hidden="true" /> + <span className="sr-only">Загрузка</span>
```

### 8.4 Screen Reader

- Все иконки из `lucide-react` — `aria-hidden="true"` (декоративные)
- Loading spinner — дополнительный `.sr-only` текст
- Risk tier badge — читается с `aria-label`
- Confidence meter — `role="meter"` с числовыми значениями
- Stage bar — `role="img"` с описанием
- Recommendation block — `aria-label="Рекомендация"`

### 8.5 Focus Management

```tsx
// При переключении табов — фокус на первый input
useEffect(() => {
  const firstInput = document.getElementById("age");
  firstInput?.focus();
}, [tab]);

// При появлении результата — focus на ResultCard
const resultRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (result) {
    resultRef.current?.focus();
  }
}, [result]);

// Explain dialog — focus trap
// (использовать shadcn Dialog или @radix-ui/react-focus-scope)
```

### 8.6 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .explain-region-draw,
  .explain-region-pulse {
    animation: none;
  }

  .animate-in {
    animation: none;
    opacity: 1;
    transform: none;
  }

  .animate-pulse,
  .animate-ping,
  .animate-spin {
    animation: none;
  }
}
```

---

## 9. Dependencies

### 9.1 shadcn/ui компоненты (добавить через `npx shadcn add`)

```bash
npx shadcn add card
npx shadcn add badge
npx shadcn add button
npx shadcn add tabs
npx shadcn add input
npx shadcn add label
npx shadcn add checkbox
npx shadcn add progress
npx shadcn add skeleton
npx shadcn add alert
```

### 9.2 Lucide иконки (уже в apps/web)

```typescript
import {
  Stethoscope,      // clinical tab
  Microscope,       // full tab
  Upload,           // drop zone
  X,                // remove file / close
  FileImage,        // file preview
  AlertTriangle,    // warning / error
  Loader2,          // spinner
  Play,             // submit button
  Brain,            // explain button
  TrendingUp,       // FIB-4 metric
  Activity,         // APRI / Stage metric
  BarChart3,        // Confidence metric
  CheckCircle2,     // supporting reasoning
  Lightbulb,        // recommendation
  Clock,            // elapsed time
  AlertCircle,      // error alert
} from "lucide-react";
```

### 9.3 npm зависимости

```bash
# Уже есть в проекте:
# - react, react-dom
# - tailwindcss
# - lucide-react
# - class-variance-authority
# - clsx
# - tailwind-merge

# Добавить:
npm install @radix-ui/react-visually-hidden   # screen-only текст
```

### 9.4 package.json (apps/ml-lab)

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@radix-ui/react-tabs": "^1.0.0",
    "@radix-ui/react-progress": "^1.0.0",
    "@radix-ui/react-visually-hidden": "^1.0.0",
    "lucide-react": "^0.400.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  },
  "devDependencies": {
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0"
  }
}
```

---

## 10. Migration Guide

### 10.1 Порядок миграции

1. **Установить shadcn/ui** в apps/ml-lab
   ```bash
   cd apps/ml-lab
   npx shadcn@latest init
   ```

2. **Установить shadcn компоненты**
   ```bash
   npx shadcn add card badge button tabs input label checkbox progress skeleton alert
   ```

3. **Обновить styles.css** — заменить на Tailwind + кастомные анимации

4. **Создать компоненты** по порядку:
   - `components/MlLabHeader.tsx`
   - `components/MlLabTabs.tsx`
   - `components/ClinicalForm.tsx`
   - `components/DropZone.tsx`
   - `components/ResultCard.tsx`
   - `components/ConfidenceMeter.tsx`
   - `components/ExplainOverlay.tsx` (рефакторинг)
   - `components/AnalysisSkeleton.tsx`
   - `components/ProgressIndicator.tsx`
   - `components/MlLabFooter.tsx`

5. **Рефакторинг App.tsx** — использовать новые компоненты

6. **Добавить accessibility утилиты**

### 10.2 Что удалить из старого кода

| Старый код | Замена |
|------------|--------|
| `<pre class="json">` | `<ResultCard>` |
| `<input type="file">` напрямую | `<DropZone>` |
| Кастомные `.tab`, `.tab.active` | shadcn `<Tabs>` |
| `.card` CSS class | shadcn `<Card>` |
| `.dot.ok` / `.dot.bad` | Tailwind + animate |
| `@keyframes draw` | `@keyframes explain-draw` |
| `@keyframes pulse` | `@keyframes explain-pulse` |
| `styles.css` (200+ строк) | Tailwind utilities + небольшой custom CSS |

### 10.3 Новый App.tsx (структура)

```tsx
import { useState, useEffect, useRef, type FormEvent } from "react";
import { checkHealth, runInference, triageClinical, type InferenceResult } from "./api";
import { MlLabHeader } from "./components/MlLabHeader";
import { MlLabTabs } from "./components/MlLabTabs";
import { ClinicalForm } from "./components/ClinicalForm";
import { ResultCard } from "./components/ResultCard";
import { ExplainOverlay } from "./components/ExplainOverlay";
import { AnalysisSkeleton } from "./components/AnalysisSkeleton";
import { MlLabFooter } from "./components/MlLabFooter";

type Tab = "clinical" | "full";

export default function App() {
  const [tab, setTab] = useState<Tab>("full");
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showExplain, setShowExplain] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // form state
  const [age, setAge] = useState("52");
  const [ast, setAst] = useState("65");
  const [alt, setAlt] = useState("70");
  const [platelets, setPlatelets] = useState("180");
  const [hbv, setHbv] = useState(false);
  const [etiology, setEtiology] = useState("MASLD/НАЖБП");

  useEffect(() => { void checkHealth().then(setOnline); }, []);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // focus first input on tab change
  useEffect(() => {
    document.getElementById("age")?.focus();
  }, [tab]);

  // focus result card when result appears
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setShowExplain(false);
    setLoading(true);

    try {
      if (tab === "clinical") {
        const data = await triageClinical({
          age: Number(age), ast: Number(ast), alt: Number(alt),
          platelets: Number(platelets), hbv_positive: hbv, etiology,
        });
        setResult(data);
      } else {
        if (!file) { setError("Загрузите УЗИ-снимок"); setLoading(false); return; }
        const data = await runInference(
          { age, ast, alt, platelets, hbv: hbv ? "yes" : "no", etiology },
          file,
        );
        setResult(data);
        setShowExplain(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запроса");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">
        <MlLabHeader online={online} apiUrl={import.meta.env.VITE_ML_API_URL ?? "localhost:8000"} />

        <MlLabTabs activeTab={tab} onTabChange={setTab} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Form */}
          <ClinicalForm
            values={{ age, ast, alt, platelets, etiology, hbv }}
            onChange={(field, value) => {
              const setters: Record<string, Function> = { age: setAge, ast: setAst, alt: setAlt, platelets: setPlatelets, etiology: setEtiology, hbv: setHbv };
              setters[field]?.(value);
            }}
            onSubmit={onSubmit}
            loading={loading}
            error={error}
            tab={tab}
            file={file}
            onFileChange={setFile}
            preview={preview}
          />

          {/* Right: Result or Skeleton */}
          <div ref={resultRef} tabIndex={-1} aria-live="polite">
            {loading && !result && <AnalysisSkeleton variant="result" />}
            {result && (
              <ResultCard
                result={result}
                hasExplainability={tab === "full" && !!result.explanation}
                onShowExplain={() => setShowExplain(true)}
              />
            )}
            {!loading && !result && (
              <div className="hidden lg:flex items-center justify-center h-full min-h-[300px] rounded-xl border-2 border-dashed border-slate-200">
                <div className="text-center space-y-2">
                  <Microscope className="h-10 w-10 text-slate-300 mx-auto" aria-hidden="true" />
                  <p className="text-sm text-slate-400">Результат появится после анализа</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ExplainOverlay — под обеими колонками */}
        {result && tab === "full" && preview && result.explanation && (
          <ExplainOverlay
            imageUrl={preview}
            region={result.findings?.[0]?.region}
            explanation={result.explanation}
            active={showExplain}
            onClose={() => setShowExplain(false)}
          />
        )}

        <MlLabFooter />
      </div>
    </div>
  );
}
```

---

## Приложение: Полный список shadcn/ui компонентов

| Компонент | Использование | Кастомизация |
|-----------|--------------|-------------|
| `Card` | Form, Result, Skeleton | `shadow-sm border-slate-200` |
| `CardHeader` | Заголовки карточек | `pb-3/pb-4` |
| `CardContent` | Контент карточек | `space-y-4` |
| `CardTitle` | Заголовки | `text-lg font-semibold` |
| `Badge` | Risk tier | `variant="outline"` + цветные классы |
| `Button` | Submit, Explain | `bg-teal-600`, `variant="outline"` |
| `Tabs` | Tab переключение | `grid-cols-2 h-11` |
| `TabsList` | Контейнер табов | — |
| `TabsTrigger` | Триггер таба | `gap-2` для иконки |
| `Input` | Все текстовые поля | `h-10 focus-visible:ring-teal-500` |
| `Label` | Подписи полей | `text-sm font-medium text-slate-600` |
| `Checkbox` | ХВГ+ | `data-[state=checked]:bg-teal-600` |
| `Progress` | FIB-4, APRI, Confidence | `h-1.5` |
| `Skeleton` | Loading state | Стандартный |
| `Alert` | Error message | `variant="destructive"` |

---

*Document version: 1.0*  
*Last updated: 2026-07-08*
