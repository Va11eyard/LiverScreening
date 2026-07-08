import { format } from "date-fns";
import { ru } from "date-fns/locale";

import { parseLocalYMD } from "./ymd";

export function formatDisplayDate(ymd: string): string {
  const d = parseLocalYMD(ymd);
  if (!d) return "—";
  return format(d, "d.MM.yyyy", { locale: ru });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d.MM.yyyy HH:mm", { locale: ru });
}
