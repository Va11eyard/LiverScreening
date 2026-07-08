import { FormEvent, useEffect, useState } from "react";

import { checkHealth, runInference, triageClinical, type InferenceResult } from "./api";
import { ExplainOverlay } from "./components/ExplainOverlay";

type Tab = "clinical" | "full";

export default function App() {
  const [tab, setTab] = useState<Tab>("full");
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
    setShowExplain(false);
    setLoading(true);
    try {
      if (tab === "clinical") {
        const data = await triageClinical({
          age: Number(age),
          ast: Number(ast),
          alt: Number(alt),
          platelets: Number(platelets),
          hbv_positive: hbv,
          etiology,
        });
        setResult(data);
      } else {
        if (!file) {
          setError("Загрузите УЗИ-снимок");
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
        setShowExplain(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запроса");
    } finally {
      setLoading(false);
    }
  }

  const inference = result as InferenceResult | null;

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">Прототип · отдельный контур</p>
          <h1>HepatoScreen ML Lab</h1>
          <p className="muted">Загрузка УЗИ и тестирование модели без клинического регистра</p>
        </div>
        <div className="status">
          <span className={online ? "dot ok" : "dot bad"} />
          ML API {online ? "online" : "offline"}
        </div>
      </header>

      <nav className="tabs">
        <button type="button" className={tab === "full" ? "tab active" : "tab"} onClick={() => setTab("full")}>
          УЗИ + клиника
        </button>
        <button
          type="button"
          className={tab === "clinical" ? "tab active" : "tab"}
          onClick={() => setTab("clinical")}
        >
          Только FIB-4 / APRI
        </button>
        <a className="tab link" href="http://localhost:3004" target="_blank" rel="noreferrer">
          → Клиническая платформа
        </a>
      </nav>

      <form className="card" onSubmit={onSubmit}>
        <div className="grid">
          <label>
            Возраст
            <input value={age} onChange={(e) => setAge(e.target.value)} type="number" />
          </label>
          <label>
            АСТ
            <input value={ast} onChange={(e) => setAst(e.target.value)} type="number" />
          </label>
          <label>
            АЛТ
            <input value={alt} onChange={(e) => setAlt(e.target.value)} type="number" />
          </label>
          <label>
            Тромбоциты
            <input value={platelets} onChange={(e) => setPlatelets(e.target.value)} type="number" />
          </label>
          <label className="wide">
            Этиология
            <input value={etiology} onChange={(e) => setEtiology(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={hbv} onChange={(e) => setHbv(e.target.checked)} />
            ХВГ+
          </label>
        </div>

        {tab === "full" && (
          <label className="upload wide">
            УЗИ печени
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <button type="submit" className="primary" disabled={loading}>
          {loading ? "Анализ…" : "Запустить модель"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>

      {result && (
        <section className="card">
          <h2>Результат</h2>
          <pre className="json">{JSON.stringify(result, null, 2)}</pre>
          {tab === "full" && preview && inference?.explanation && (
            <ExplainOverlay
              imageUrl={preview}
              region={inference.findings?.[0]?.region}
              explanation={inference.explanation}
              active={showExplain}
            />
          )}
        </section>
      )}

      <footer className="footer muted">
        Клинические кейсы и регистр — на <a href="http://localhost:3004">localhost:3004</a>. Обучение модели — позже на
        GPU (RTX 5050).
      </footer>
    </div>
  );
}
