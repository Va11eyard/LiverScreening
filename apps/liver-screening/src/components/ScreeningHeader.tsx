import { HeartPulse, Shield } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type Props = {
  step: number;
  totalSteps: number;
};

export function ScreeningHeader({ step, totalSteps }: Props) {
  return (
    <header className="mb-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xl font-bold tracking-tight text-hub-heading">LiverScreening</span>
        <Badge variant="secondary" className="gap-1">
          <Shield className="size-3" />
          Анонимно
        </Badge>
      </div>

      <div className="overflow-hidden rounded-[20px] bg-linear-to-br from-hub-navy via-hub-cta to-hub-page p-6 text-white shadow-(--shadow-results-card)">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-2xl backdrop-blur-sm">
            🫙
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/80">
              Скрининг пациента
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Полюбите свою печень</h1>
            <p className="mt-1 text-sm text-white/90">
              Узнайте риск болезни печени · без анализов, 2–3 минуты
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-medium text-hub-muted">
          <span className="inline-flex items-center gap-1.5">
            <HeartPulse className="size-3.5 text-hub-cta" />
            {step < totalSteps ? `Шаг ${step} из ${totalSteps}` : "Результат готов"}
          </span>
          <span className="tabular-nums">{Math.round((step / totalSteps) * 100)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-(--odos-input-border)">
          <div
            className="h-full rounded-full bg-linear-to-r from-hub-cta to-hub-cta-light transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>
    </header>
  );
}
