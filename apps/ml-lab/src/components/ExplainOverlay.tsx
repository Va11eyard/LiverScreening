import { useEffect, useState } from "react";

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
    <div className="stack">
      <div className="image-wrap">
        <img src={imageUrl} alt="УЗИ печени" className="preview" />
        {active && (
          <svg className="overlay" viewBox="0 0 1 1" preserveAspectRatio="none">
            <ellipse className="region-draw" cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry} />
            <ellipse className="region-pulse" cx={r.cx} cy={r.cy} rx={r.rx * 1.05} ry={r.ry * 1.05} />
          </svg>
        )}
      </div>
      {showDialog && explanation && (
        <div className="dialog" role="dialog">
          <h3>{explanation.title ?? "Объяснение ИИ"}</h3>
          <p className="muted">{explanation.summary}</p>
          {explanation.reasoning?.map((line) => (
            <p key={line} className="reason">
              • {line}
            </p>
          ))}
          {explanation.recommendation && (
            <p className="rec">
              <strong>Рекомендация:</strong> {explanation.recommendation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
