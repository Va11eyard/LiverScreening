import { apiBaseUrl } from "./constants";
import { mapApiErrorMessage } from "./api-errors";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function parseError(res: Response) {
  try {
    const data = await res.json();
    return (data as { error?: string }).error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

function clientFetchInit(options: RequestInit = {}): RequestInit {
  return {
    ...options,
    credentials: "same-origin",
  };
}

function throwApiError(res: Response, message: string): never {
  if (res.status === 401) {
    throw new ApiError("Сессия истекла. Войдите снова", 401);
  }
  throw new ApiError(mapApiErrorMessage(message), res.status);
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = options;
  const normalized = path.startsWith("/api/v1/") ? path.replace("/api/v1/", "") : path.replace(/^\//, "");
  const res = await fetch(`${apiBaseUrl()}/${normalized}`, {
    ...clientFetchInit(rest),
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
  if (!res.ok) {
    throwApiError(res, await parseError(res));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export async function apiUploadForm<T>(path: string, formData: FormData): Promise<T> {
  const normalized = path.startsWith("/api/v1/") ? path.replace("/api/v1/", "") : path.replace(/^\//, "");
  const res = await fetch(`${apiBaseUrl()}/${normalized}`, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  });
  if (!res.ok) {
    throwApiError(res, await parseError(res));
  }
  return res.json() as Promise<T>;
}

export async function downloadBlob(path: string, options: { filename: string }): Promise<void> {
  const { filename } = options;
  const normalized = path.startsWith("/api/v1/") ? path.replace("/api/v1/", "") : path.replace(/^\//, "");
  const res = await fetch(`${apiBaseUrl()}/${normalized}`, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    throwApiError(res, await parseError(res));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function caseImageUrl(caseId: string, imageId: string, download = false): string {
  const base = `${apiBaseUrl()}/cases/${encodeURIComponent(caseId)}/images/${encodeURIComponent(imageId)}/file`;
  return download ? `${base}?download=1` : base;
}

export function reportQuery(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.hospital) params.set("hospital", filters.hospital);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.patient) params.set("patient", filters.patient);
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.aprop) params.set("aprop", "1");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export type ReportFilters = {
  hospital?: string;
  dateFrom?: string;
  dateTo?: string;
  patient?: string;
  stage?: string;
  aprop?: boolean;
};

export function patientLabel(mother?: string, child?: string) {
  const m = mother?.trim() ?? "";
  const c = child?.trim() ?? "";
  if (m && c) return `${m} (${c})`;
  return m || c || "—";
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "doctor" | "coordinator" | "admin";
  hospital?: string;
};

export type LoginResponse = {
  tokens: TokenPair;
  user: AuthUser;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type CaseRecord = {
  case_id: string;
  date: string;
  hospital: string;
  doctor: string;
  motherSurname: string;
  childSurname: string;
  ga?: string;
  bw?: number;
  pca?: number;
  ph?: string;
  eye?: string;
  visit?: string;
  riskFactors?: string;
  camera?: string;
  imageQuality?: string;
  avascColor?: string;
  avascHours?: string;
  avascLoc?: string;
  zone?: string;
  artDiam?: string;
  artCourse?: string;
  veins?: string;
  avpDZN?: string;
  stage?: string;
  plusDisease?: string;
  ropForm?: string;
  preDiag?: string;
  aprop?: string;
  confidence?: string;
  recommendation?: string;
  doubtful?: string;
  notes?: string;
  aiMatch?: string | null;
  ai_snapshot?: Record<string, unknown> | null;
};

export type CaseImageInfo = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type CaseDetail = CaseRecord & {
  images: CaseImageInfo[];
};

export type UploadAIBlock = {
  status: string;
  suggestions?: Record<string, string>;
  ai_match?: string;
  error?: string;
};

export type UploadCaseImagesResult = {
  images: CaseImageInfo[];
  ai?: UploadAIBlock;
};

export type WeeklyReportRow = {
  case_id: string;
  date: string;
  hospital: string;
  doctor: string;
  patient_label: string;
  mother_surname: string;
  child_surname: string;
  ga?: string;
  bw?: number;
  pca?: number;
  ph?: string;
  stage?: string;
  plus_disease?: string;
  rop_form?: string;
  pre_diag?: string;
  ai_match?: string | null;
  aprop?: string;
  doubtful?: string;
  notes?: string;
  image_count?: number;
};

export type StageReportRow = {
  stage: string;
  count: number;
  plus_disease: number;
  aggressive: number;
  avg_ga?: number | null;
  avg_bw?: number | null;
  avg_ph?: number | null;
};

export type HospitalReportRow = {
  hospital: string;
  total: number;
  rop_detected: number;
  stages_1_2: number;
  stages_3_5: number;
  plus_disease: number;
  aggressive: number;
  doubtful: number;
};

export type SurveyRecord = {
  id: string;
  date: string;
  hospital: string;
  ux_avg: number;
  clinical_avg: number;
  process_avg: number;
  total_avg: number;
  comment?: string;
};

export function avg(nums: number[]) {
  const valid = nums.filter((n) => n > 0);
  if (!valid.length) return 0;
  return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1));
}
