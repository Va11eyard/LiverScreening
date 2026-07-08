export type RiskTier = "low" | "watch" | "urgent" | "refer_hepatology";

export const riskTierConfig: Record<
  RiskTier,
  { label: string; bg: string; text: string; border: string }
> = {
  low: {
    label: "Низкий риск",
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
  watch: {
    label: "Наблюдение",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  urgent: {
    label: "Срочно",
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
  },
  refer_hepatology: {
    label: "К гепатологу",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
};

export function parseRiskTier(value: unknown): RiskTier | null {
  if (typeof value !== "string") return null;
  if (value in riskTierConfig) return value as RiskTier;
  return null;
}
