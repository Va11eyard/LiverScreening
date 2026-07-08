export type ClinicalFieldKey = "age" | "ast" | "alt" | "platelets" | "etiology";

export type RangeHint = {
  high?: number;
  low?: number;
  highMessage?: string;
  lowMessage?: string;
};

export const CLINICAL_FIELD_UNITS: Record<ClinicalFieldKey, string | undefined> = {
  age: "лет",
  ast: "ЕД/Л",
  alt: "ЕД/Л",
  platelets: "×10⁹/Л",
  etiology: undefined,
};

export const CLINICAL_FIELD_RANGES: Partial<Record<ClinicalFieldKey, RangeHint>> = {
  ast: { high: 40, highMessage: "выше нормы" },
  alt: { high: 40, highMessage: "выше нормы" },
  platelets: { low: 150, lowMessage: "ниже нормы" },
};

export function getRangeHint(
  field: ClinicalFieldKey,
  value: string,
): string | null {
  if (!value.trim()) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  const range = CLINICAL_FIELD_RANGES[field];
  if (!range) return null;
  if (range.high !== undefined && num > range.high) return range.highMessage ?? "выше нормы";
  if (range.low !== undefined && num < range.low) return range.lowMessage ?? "ниже нормы";
  return null;
}

export function isOutOfRange(field: ClinicalFieldKey, value: string): boolean {
  return getRangeHint(field, value) !== null;
}
