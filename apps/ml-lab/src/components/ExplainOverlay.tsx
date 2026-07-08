import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

type Region = { cx: number; cy: number; rx: number; ry: number };

type Explanation = {
  title?: string;
  summary?: string;
  reasoning?: string[];
  recommendation?: string;
};

type Props = {
  imageUrl: string;
  region?: Region;
  explanation?: Explanation;
  active: boolean;
};

export function ExplainOverlay({ imageUrl, region, explanation, active }: Props) {
  const [showDialog, setShowDialog] = useState(false);
  const r = region ?? { cx: 0.62, cy: 0.45, rx: 0.18, ry: 0.22 };

  useEffect(() => {
    if (!active) {
      setShowDialog(false);
      return;
    }
    const t = window.setTimeout(() => setShowDialog(true), 900);
    return () => window.clearTimeout(t);
  }, [active]);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900/5">
        <img src={imageUrl} alt="УЗИ печени" className="block max-h-80 w-full object-contain" />
        {active && (
          <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none">
            <ellipse
              className="explain-region-draw fill-none stroke-red-500"
              strokeWidth="0.008"
              cx={r.cx}
              cy={r.cy}
              rx={r.rx}
              ry={r.ry}
            />
            <ellipse
              className="explain-region-pulse fill-none stroke-red-400/60"
              strokeWidth="0.012"
              cx={r.cx}
              cy={r.cy}
              rx={r.rx * 1.05}
              ry={r.ry * 1.05}
            />
          </svg>
        )}
      </div>
      {showDialog && explanation && (
        <Card className="border-teal-100 bg-teal-50/40">
          <CardHeader>
            <CardTitle className="text-base">{explanation.title ?? "Объяснение ИИ"}</CardTitle>
            {explanation.summary && (
              <p className="text-sm text-slate-600">{explanation.summary}</p>
            )}
          </CardHeader>
          {explanation.reasoning?.map((line) => (
            <p key={line} className="mb-2 text-sm text-slate-700">
              • {line}
            </p>
          ))}
          {explanation.recommendation && (
            <p className="mt-2 text-sm font-medium text-teal-900">
              Рекомендация: {explanation.recommendation}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
