const ML_API = import.meta.env.VITE_ML_API_URL ?? "http://localhost:8000";

export type ClinicalPayload = {
  age: number;
  ast: number;
  alt: number;
  platelets: number;
  hbv_positive: boolean;
  etiology: string;
};

export type InferenceResult = {
  stage: string;
  plus_disease: string;
  zone: string;
  rop_form: string;
  pre_diag: string;
  confidence: string;
  fib4: string;
  apri: string;
  risk_tier: string;
  explanation?: {
    title?: string;
    summary?: string;
    reasoning?: string[];
    recommendation?: string;
  };
  findings?: Array<{
    region?: { cx: number; cy: number; rx: number; ry: number };
    confidence?: number;
  }>;
};

export async function triageClinical(body: ClinicalPayload) {
  const res = await fetch(`${ML_API}/triage/clinical`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function runInference(metadata: Record<string, string>, file?: File) {
  const form = new FormData();
  form.append("metadata", JSON.stringify(metadata));
  if (file) form.append("image", file, file.name);
  const res = await fetch(`${ML_API}/inference`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as InferenceResult;
}

export async function checkHealth() {
  const res = await fetch(`${ML_API}/health`);
  return res.ok;
}
