import { parseRiskTier, riskTierConfig, type RiskTier } from "@/lib/risk-tier";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  tier: RiskTier | null;
  confidence: number;
};

export function ConfidenceMeter({ tier, confidence }: Props) {
  const pct = Math.round(Math.min(100, Math.max(0, confidence * 100)));
  const barColor =
    tier === "refer_hepatology"
      ? "bg-red-500"
      : tier === "urgent"
        ? "bg-orange-500"
        : tier === "watch"
          ? "bg-amber-500"
          : "bg-green-500";

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">Достоверность модели</span>
        <span className="font-semibold text-slate-900">{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full transition-all duration-700", barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type ResultProps = {
  result: Record<string, unknown>;
  clinicalOnly?: boolean;
};

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function ResultCard({ result, clinicalOnly }: ResultProps) {
  const tier = parseRiskTier(result.risk_tier);
  const tierStyle = tier ? riskTierConfig[tier] : null;
  const confRaw = result.confidence;
  const confidence =
    typeof confRaw === "number"
      ? confRaw
      : parseFloat(String(confRaw ?? "0.75")) || 0.75;

  const explanation = result.explanation as
    | { title?: string; summary?: string; reasoning?: string[]; recommendation?: string }
    | undefined;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Результат анализа</CardTitle>
          {tierStyle && (
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                tierStyle.bg,
                tierStyle.text,
                tierStyle.border,
              )}
            >
              {tierStyle.label}
            </span>
          )}
          {result.model_loaded === true && (
            <Badge variant="success">Реальная модель</Badge>
          )}
          {result.stub_mode === true && (
            <Badge variant="warning">Stub / нет весов</Badge>
          )}
        </div>
        {explanation?.summary && <CardDescription>{explanation.summary}</CardDescription>}
      </CardHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {!clinicalOnly && (
          <>
            <MetricCard label="Фиброз (F)" value={String(result.stage ?? "—")} />
            <MetricCard label="Стеатоз" value={String(result.plus_disease ?? "—")} />
            <MetricCard label="УЗИ-признаки" value={String(result.rop_form ?? "—")} />
          </>
        )}
        <MetricCard label="FIB-4" value={String(result.fib4 ?? "—")} />
        <MetricCard label="APRI" value={String(result.apri ?? "—")} />
        <MetricCard label="Триаж" value={String(result.zone ?? result.recommendation ?? "—")} />
        {!clinicalOnly && (
          <MetricCard label="Диагноз" value={String(result.pre_diag ?? "—")} />
        )}
      </div>

      <ConfidenceMeter tier={tier} confidence={confidence} />

      {explanation?.reasoning && explanation.reasoning.length > 0 && (
        <ul className="mt-6 space-y-2 border-t border-slate-100 pt-4">
          {explanation.reasoning.map((line, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-600">
              <span className="text-teal-600">•</span>
              {line}
            </li>
          ))}
        </ul>
      )}

      {explanation?.recommendation && (
        <p className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-sm font-medium text-teal-900">
          {explanation.recommendation}
        </p>
      )}
    </Card>
  );
}
