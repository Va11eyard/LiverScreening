import { FormEvent, useCallback, useEffect, useState } from "react";
import { Activity, Calculator, Loader2 } from "lucide-react";

import { checkHealth, runInference, triageClinical, type InferenceResult } from "./api";
import { AnalysisSkeleton } from "@/components/AnalysisSkeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClinicalForm } from "@/components/ClinicalForm";
import { DropZone } from "@/components/DropZone";
import { ExplainOverlay } from "@/components/ExplainOverlay";
import { FormSection } from "@/components/FormSection";
import { MlLabHeader } from "@/components/MlLabHeader";
import { MlLabTabs, type LabTab } from "@/components/MlLabTabs";
import { ResultCard } from "@/components/ResultCard";

type ClinicalTriageResponse = {
  fib4: number;
  apri: number;
  risk_tier: string;
  recommendation: string;
  highlighted_fields?: string[];
};

function normalizeClinicalResult(data: ClinicalTriageResponse): Record<string, unknown> {
  return {
    fib4: String(data.fib4),
    apri: String(data.apri),
    risk_tier: data.risk_tier,
    zone: data.recommendation,
    recommendation: data.recommendation,
    highlighted_fields: data.highlighted_fields,
    confidence: "0.85",
    explanation: {
      summary: "Расчёт FIB-4 и APRI по лабораторным данным без анализа УЗИ.",
      recommendation: data.recommendation,
    },
  };
}

export default function App() {
  const [tab, setTab] = useState<LabTab>("full");
  const [resultTab, setResultTab] = useState<LabTab | null>(null);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InferenceResult | Record<string, unknown> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showExplain, setShowExplain] = useState(false);

  const [age, setAge] = useState("52");
  const [ast, setAst] = useState("65");
  const [alt, setAlt] = useState("70");
  const [platelets, setPlatelets] = useState("180");
  const [hbv, setHbv] = useState(false);
  const [etiology, setEtiology] = useState("MASLD/НАЖБП");

  const handleTabChange = useCallback((next: LabTab) => {
    setTab(next);
    setError("");
    setShowExplain(false);
    if (resultTab && resultTab !== next) {
      setResult(null);
      setResultTab(null);
    }
  }, [resultTab]);

  useEffect(() => {
    void checkHealth().then(setOnline);
  }, []);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setResultTab(null);
    setShowExplain(false);
    setLoading(true);
    try {
      if (tab === "clinical") {
        const data = (await triageClinical({
          age: Number(age),
          ast: Number(ast),
          alt: Number(alt),
          platelets: Number(platelets),
          hbv_positive: hbv,
          etiology,
        })) as ClinicalTriageResponse;
        setResult(normalizeClinicalResult(data));
        setResultTab("clinical");
      } else {
        if (!file) {
          setError("Загрузите УЗИ-снимок (JPG или PNG)");
          setLoading(false);
          return;
        }
        const data = await runInference(
          {
            age,
            ast,
            alt,
            platelets,
            hbv: hbv ? "yes" : "no",
            etiology,
          },
          file,
        );
        setResult(data);
        setResultTab("full");
        setShowExplain(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запроса");
    } finally {
      setLoading(false);
    }
  }

  const inference = result as InferenceResult | null;
  const clinicalOnly = resultTab === "clinical";

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-8 pb-16">
      <MlLabHeader online={online} />
      <MlLabTabs tab={tab} onTab={handleTabChange} />

      <form onSubmit={onSubmit} className="mb-6 space-y-5">
        {tab === "clinical" && (
          <p className="rounded-xl border border-teal-100 bg-teal-50/80 px-4 py-3 text-sm text-teal-900">
            Режим <strong>только FIB-4 / APRI</strong> — введите клинические данные. УЗИ не требуется,
            vision-модель не вызывается.
          </p>
        )}

        <ClinicalForm
          age={age}
          ast={ast}
          alt={alt}
          platelets={platelets}
          etiology={etiology}
          hbv={hbv}
          onAge={setAge}
          onAst={setAst}
          onAlt={setAlt}
          onPlatelets={setPlatelets}
          onEtiology={setEtiology}
          onHbv={setHbv}
        />

        {tab === "full" && (
          <FormSection
            title="Загрузка УЗИ"
            description="Перетащите JPG или PNG снимок печени для vision-модели и fusion score (клиника 0.7 + УЗИ 0.3)"
          >
            <DropZone file={file} preview={preview} onFile={setFile} />
          </FormSection>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={loading} size="lg" className="w-full sm:w-auto">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {tab === "clinical" ? "Расчёт…" : "Анализ…"}
              </>
            ) : tab === "clinical" ? (
              <>
                <Calculator className="size-4" />
                Рассчитать FIB-4 / APRI
              </>
            ) : (
              <>
                <Activity className="size-4" />
                Запустить УЗИ + клиника
              </>
            )}
          </Button>
          {tab === "full" && (
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  const res = await fetch("/demo-samples.json");
                  const data = await res.json();
                  const demo = data.nfld_demo;
                  setAge(demo.age);
                  setAst(demo.ast);
                  setAlt(demo.alt);
                  setPlatelets(demo.platelets);
                  setHbv(demo.hbv);
                  setEtiology(demo.etiology);
                  const imgRes = await fetch("/samples/nfld-id6.jpg");
                  const blob = await imgRes.blob();
                  setFile(new File([blob], "nfld-id6.jpg", { type: blob.type || "image/jpeg" }));
                  setError("");
                } catch {
                  setError("Не удалось загрузить демо-пример NFLD");
                }
              }}
            >
              Загрузить пример NFLD
            </Button>
          )}
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </form>

      {loading && (
        <Card>
          <AnalysisSkeleton />
        </Card>
      )}

      {result && !loading && resultTab && (
        <>
          <ResultCard result={result as Record<string, unknown>} clinicalOnly={clinicalOnly} />
          {resultTab === "full" && preview && inference?.explanation && (
            <ExplainOverlay
              imageUrl={preview}
              region={inference.findings?.[0]?.region}
              explanation={inference.explanation}
              active={showExplain}
            />
          )}
        </>
      )}
    </div>
  );
}
