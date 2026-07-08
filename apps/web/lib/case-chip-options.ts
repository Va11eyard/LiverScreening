import type { LucideIcon } from "lucide-react";
import { CircleAlert, CircleCheck, CircleX, TriangleAlert } from "lucide-react";

export type ChipOption = {
  value: string;
  label: string;
  icon?: LucideIcon;
  iconClassName?: string;
};

export const IMAGE_QUALITY_OPTIONS: ChipOption[] = [
  { value: "Хорошее", label: "Хорошее", icon: CircleCheck, iconClassName: "text-emerald-600" },
  { value: "Удовлетворительное", label: "Удовлетворительное", icon: TriangleAlert, iconClassName: "text-amber-500" },
  { value: "Плохое", label: "Плохое", icon: CircleX, iconClassName: "text-red-500" },
];

export const ETIOLOGY_OPTIONS = ["MASLD/НАЖБП", "ХВГ", "ХВГ+ХВС", "Алкогольная", "Другое"];
export const VISIT_OPTIONS = ["1-й скрининг", "2-й", "3-й", "Контроль", "После лечения"];
export const US_DEVICE_OPTIONS = ["Портативное УЗИ", "LOGIQ", "Mindray", "Другое"];

export const STEATOSIS_OPTIONS: ChipOption[] = [
  { value: "Нет / минимальный", label: "Нет / минимальный" },
  { value: "Лёгкий", label: "Лёгкий", icon: TriangleAlert, iconClassName: "text-amber-500" },
  { value: "Умеренный", label: "Умеренный", icon: CircleAlert, iconClassName: "text-orange-500" },
  { value: "Выраженный", label: "Выраженный", icon: CircleX, iconClassName: "text-red-500" },
];

export const FIBROSIS_STAGE_OPTIONS = ["F0", "F1", "F2", "F3", "F4", "Не определено"];

export const TRIAGE_OPTIONS: ChipOption[] = [
  { value: "Низкий риск", label: "Низкий риск", icon: CircleCheck, iconClassName: "text-emerald-600" },
  { value: "Наблюдение", label: "Наблюдение", icon: TriangleAlert, iconClassName: "text-amber-500" },
  { value: "Срочно", label: "Срочно", icon: CircleAlert, iconClassName: "text-orange-500" },
  { value: "К гепатологу", label: "К гепатологу", icon: CircleX, iconClassName: "text-red-500" },
];

export const HBV_OPTIONS = ["Нет", "Да (ХВГ)", "Неизвестно"];

export const PRE_DIAG_OPTIONS = [
  "Норма",
  "Стеатоз",
  "MASLD",
  "ХВГ",
  "Фиброз",
  "Цирроз",
  "Сомнительно",
];

export const US_FINDING_OPTIONS = [
  "Норма",
  "Гиперэхогенность",
  "Неоднородная эхоструктура",
  "Узел / очаг",
  "Асцит",
];

export const CONFIDENCE_OPTIONS = ["Уверен", "Частично", "Сомневаюсь"];
export const RECOMMENDATION_OPTIONS = [
  "Наблюдение в ПМСП",
  "Контроль 6 мес.",
  "Дообследование",
  "Направление к гепатологу",
];

export function chipValues(options: ChipOption[]): string[] {
  return options.map((o) => o.value);
}
