"use client";

import { Bot } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { CaseImageUpload } from "@/components/case-image-upload";
import { ChipCheckboxGroup } from "@/components/chip-checkbox-group";
import { ChipGroup, ChipHint } from "@/components/chip-group";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, apiUploadForm, ApiError, type CaseDetail } from "@/lib/api";
import { userErrorMessage } from "@/lib/api-errors";
import { MAX_CASE_UPLOAD_BYTES, prepareFilesForSubmit, totalUploadBytes } from "@/lib/case-image-files";
import {
  CONFIDENCE_OPTIONS,
  ETIOLOGY_OPTIONS,
  FIBROSIS_STAGE_OPTIONS,
  HBV_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  MORPHOLOGY_OPTIONS,
  PRE_DIAG_OPTIONS,
  RECOMMENDATION_OPTIONS,
  STEATOSIS_OPTIONS,
  TRIAGE_OPTIONS,
  US_DEVICE_OPTIONS,
  VISIT_OPTIONS,
} from "@/lib/case-chip-options";
import { PILOT_HOSPITALS } from "@/lib/constants";
import { caseSubmitSchema, firstZodIssueMessage, type CaseFormValues } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const COMORBIDITY_OPTIONS = [
  "СД2",
  "Ожирение (ИМТ ≥30)",
  "Артериальная гипертензия",
  "Дислипидемия",
  "Метаболический синдром",
];

const LEGACY_MORPHOLOGY: Record<string, string> = {
  "Неоднородная эхоструктура": "Неоднородность",
  "Узел / очаг": "Узловое образование",
};

function parseMorphology(ropForm?: string): string[] {
  if (!ropForm || ropForm.trim() === "Норма") return [];
  return ropForm
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => LEGACY_MORPHOLOGY[s] ?? s)
    .filter((s) => MORPHOLOGY_OPTIONS.includes(s));
}

function serializeMorphology(selected: string[]): string {
  if (selected.length === 0) return "Норма";
  return selected.join(", ");
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Label className="text-sm font-medium text-hub-heading">{children}</Label>;
}

function ConclusionSubsection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-(--odos-input-border) bg-(--odos-input-bg-subtle)/60 p-4">
      <div>
        <h3 className="text-sm font-semibold text-hub-heading">{title}</h3>
        {hint ? <p className="mt-1 text-xs text-hub-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

type NewCaseFormState = {
  formDefaults: Partial<CaseFormValues>;
  chips: Record<string, string>;
  comorbidities: string[];
};

function buildNewCaseFormState(
  templateCase: CaseDetail | undefined,
  session: { user?: { hospital?: string | null; name?: string | null } } | null,
): NewCaseFormState {
  const today = new Date().toISOString().slice(0, 10);
  if (!templateCase) {
    return {
      formDefaults: {
        date: today,
        hospital: session?.user?.hospital ?? "",
        doctor: session?.user?.name ?? "",
      },
      chips: {},
      comorbidities: [],
    };
  }
  return {
    formDefaults: {
      date: today,
      hospital: templateCase.hospital,
      doctor: templateCase.doctor,
      motherSurname: templateCase.motherSurname,
      childSurname: templateCase.childSurname,
      ga: templateCase.ga,
      bw: templateCase.bw,
      pca: templateCase.pca,
      ph: templateCase.ph,
      notes: templateCase.notes,
    },
    chips: {
      eye: templateCase.eye ?? "",
      visit: templateCase.visit ?? "",
      camera: templateCase.camera ?? "",
      imageQuality: templateCase.imageQuality ?? "",
      stage: templateCase.stage ?? "",
      plusDisease: templateCase.plusDisease ?? "",
      zone: templateCase.zone ?? "",
      ropForm: templateCase.ropForm ?? "",
      preDiag: templateCase.preDiag ?? "",
      aprop: templateCase.aprop ?? "",
      confidence: templateCase.confidence ?? "",
      recommendation: templateCase.recommendation ?? "",
    },
    comorbidities: templateCase.riskFactors
      ? templateCase.riskFactors.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
  };
}

function parseOptionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function NewCaseForm({
  fromCaseId,
  templateCase,
  sessionStatus,
  session,
}: {
  fromCaseId: string;
  templateCase?: CaseDetail;
  sessionStatus: "loading" | "authenticated" | "unauthenticated";
  session: { user?: { hospital?: string | null; name?: string | null } } | null;
}) {
  const initial = buildNewCaseFormState(templateCase, session);
  const router = useRouter();
  const [comorbidities, setComorbidities] = useState<string[]>(initial.comorbidities);
  const [morphology, setMorphology] = useState<string[]>(parseMorphology(initial.chips.ropForm));
  const [chips, setChips] = useState<Record<string, string>>(initial.chips);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const form = useForm<CaseFormValues>({
    defaultValues: initial.formDefaults,
  });

  const date = useWatch({ control: form.control, name: "date" }) ?? "";
  const hospital = useWatch({ control: form.control, name: "hospital" }) ?? "";

  useEffect(() => {
    if (templateCase) return;
    const userHospital = session?.user?.hospital;
    if (userHospital && !form.getValues("hospital")) {
      form.setValue("hospital", userHospital);
    }
    const userName = session?.user?.name;
    if (userName && !form.getValues("doctor")) {
      form.setValue("doctor", userName);
    }
  }, [session, templateCase, form]);

  function setChip(key: string, value: string) {
    setChips((prev) => ({ ...prev, [key]: value }));
  }

  async function submitCase() {
    if (sessionStatus === "loading") return;
    if (sessionStatus === "unauthenticated") {
      toast.error("Сессия истекла, войдите снова");
      router.push("/login");
      return;
    }
    const values = form.getValues();
    const raw = {
      ...values,
      ...chips,
      ropForm: serializeMorphology(morphology),
      riskFactors: comorbidities.join(", "),
      stage: chips.stage ?? "",
    };
    const parsed = caseSubmitSchema.safeParse(raw);
    if (!parsed.success) {
      toast.error(firstZodIssueMessage(parsed.error));
      return;
    }
    if (imageFiles.length === 0) {
      toast.error("Добавьте хотя бы одно УЗИ-снимок печени");
      return;
    }
    const uploadBytes = totalUploadBytes(imageFiles);
    if (uploadBytes > MAX_CASE_UPLOAD_BYTES) {
      toast.error("Слишком большой объём снимков");
      return;
    }
    const payload = parsed.data;
    try {
      setUploadProgress("Подготовка снимков…");
      const prepared = await prepareFilesForSubmit(imageFiles);
      if (prepared.files.length === 0) {
        toast.error("Не удалось прочитать снимки");
        setUploadProgress(null);
        return;
      }
      setUploadProgress(`0 / ${prepared.files.length}`);
      const formData = new FormData();
      formData.append("data", JSON.stringify(payload));
      for (const file of prepared.files) {
        formData.append("images", file, file.name);
      }
      const res = await apiUploadForm<{ case_id: string; ai?: { status: string; ai_match?: string } }>(
        "cases",
        formData,
      );
      setUploadProgress(null);
      if (res.ai?.status === "ok" && res.ai.ai_match && res.ai.ai_match !== "Совпадает") {
        toast.info(`ИИ: ${res.ai.ai_match}. Откройте карту для объяснения.`);
      }
      toast.success(`Карта отправлена: ${res.case_id}`);
      router.push(`/cases/${res.case_id}`);
    } catch (e) {
      setUploadProgress(null);
      if (e instanceof ApiError && e.status === 401) {
        toast.error(e.message);
        router.push("/login");
        return;
      }
      toast.error(userErrorMessage(e, "Ошибка сохранения"));
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submitCase();
      }}
      className="mx-auto max-w-3xl space-y-6"
    >
      <PageHeader
        title={fromCaseId ? "Повторный скрининг" : "Скрининг печени"}
        description={
          fromCaseId
            ? `Шаблон из карты ${fromCaseId}. Обновите данные и загрузите новое УЗИ.`
            : "Клинические данные + УЗИ → ИИ-триаж и регистр ПМСП"
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>0. Врач и ПМСП</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel>ФИО врача *</FieldLabel>
            <Input placeholder="Иванов И.И." {...form.register("doctor")} />
          </div>
          <div className="space-y-2">
            <FieldLabel>Дата осмотра *</FieldLabel>
            <DateField value={date} onChange={(v) => form.setValue("date", v, { shouldValidate: true })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <FieldLabel>ПМСП / учреждение *</FieldLabel>
            <Select value={hospital} onValueChange={(v) => form.setValue("hospital", v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите ПМСП" />
              </SelectTrigger>
              <SelectContent>
                {PILOT_HOSPITALS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1. Пациент и анализы</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel>Фамилия пациента *</FieldLabel>
            <Input placeholder="Иванов" {...form.register("motherSurname")} />
          </div>
          <div className="space-y-2">
            <FieldLabel>ИИН / ID *</FieldLabel>
            <Input placeholder="900101300123" {...form.register("childSurname")} />
          </div>
          <div className="space-y-2">
            <FieldLabel>Возраст (лет)</FieldLabel>
            <Input placeholder="52" {...form.register("ga")} />
          </div>
          <div className="space-y-2">
            <FieldLabel>Тромбоциты (×10⁹/л)</FieldLabel>
            <Input type="number" placeholder="200" {...form.register("bw", { setValueAs: parseOptionalNumber })} />
          </div>
          <div className="space-y-2">
            <FieldLabel>АЛТ (Ед/л)</FieldLabel>
            <Input type="number" placeholder="45" {...form.register("pca", { setValueAs: parseOptionalNumber })} />
          </div>
          <div className="space-y-2">
            <FieldLabel>АСТ (Ед/л)</FieldLabel>
            <Input placeholder="38" {...form.register("ph")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <FieldLabel>Этиология</FieldLabel>
            <ChipGroup options={ETIOLOGY_OPTIONS} value={chips.eye} onChange={(v) => setChip("eye", v)} />
            <ChipHint show={!chips.eye} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <FieldLabel>ХВГ статус</FieldLabel>
            <ChipGroup options={HBV_OPTIONS} value={chips.aprop} onChange={(v) => setChip("aprop", v)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <FieldLabel>Факторы риска</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {COMORBIDITY_OPTIONS.map((r) => {
                const on = comorbidities.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      setComorbidities((prev) => (on ? prev.filter((x) => x !== r) : [...prev, r]))
                    }
                    className={cn(
                      "rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                      on
                        ? "border-hub-cta bg-(--odos-hub-cta-tint-10) text-hub-cta"
                        : "border-(--odos-input-border) bg-white text-hub-muted hover:border-hub-cta/40",
                    )}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. УЗИ печени (обязательно)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <FieldLabel>Тип аппарата</FieldLabel>
            <ChipGroup options={US_DEVICE_OPTIONS} value={chips.camera} onChange={(v) => setChip("camera", v)} />
          </div>
          <CaseImageUpload files={imageFiles} onChange={setImageFiles} />
          <div className="space-y-2">
            <FieldLabel>Качество снимка</FieldLabel>
            <ChipGroup
              options={IMAGE_QUALITY_OPTIONS}
              value={chips.imageQuality}
              onChange={(v) => setChip("imageQuality", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Заключение врача</CardTitle>
          <CardDescription>
            Сначала морфология и стадии, затем клинический диагноз и тактика. ИИ сравнит своё предположение
            с вашим заключением после загрузки УЗИ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-3 rounded-xl border border-dashed border-hub-cta/30 bg-(--odos-hub-cta-tint-10) p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-hub-cta shadow-sm">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-hub-heading">ИИ предполагает</p>
              <p className="mt-1 text-hub-muted">
                После отправки УЗИ модель предложит диагноз и стадию. В карте кейса вы увидите сравнение:
                «ИИ предполагает» и «Заключение врача».
              </p>
            </div>
          </div>

          <ConclusionSubsection
            title="1. Морфологические признаки печени"
            hint="Можно отметить несколько признаков одновременно. Если ничего не выбрано — считается норма."
          >
            <ChipCheckboxGroup options={MORPHOLOGY_OPTIONS} values={morphology} onChange={setMorphology} />
          </ConclusionSubsection>

          <ConclusionSubsection title="2. Оценка заболевания">
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>Степень стеатоза</FieldLabel>
                <ChipGroup
                  options={STEATOSIS_OPTIONS}
                  value={chips.plusDisease}
                  onChange={(v) => setChip("plusDisease", v)}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Стадия фиброза *</FieldLabel>
                <ChipGroup
                  options={FIBROSIS_STAGE_OPTIONS}
                  value={chips.stage}
                  onChange={(v) => setChip("stage", v)}
                />
                <ChipHint show={!chips.stage} />
              </div>
            </div>
          </ConclusionSubsection>

          <ConclusionSubsection
            title="3. Итоговое заключение"
            hint="Диагноз → риск → уверенность — в клиническом порядке."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>Клинический диагноз</FieldLabel>
                <ChipGroup options={PRE_DIAG_OPTIONS} value={chips.preDiag} onChange={(v) => setChip("preDiag", v)} />
              </div>
              <div className="space-y-2">
                <FieldLabel>Риск / тактика</FieldLabel>
                <ChipGroup options={TRIAGE_OPTIONS} value={chips.zone} onChange={(v) => setChip("zone", v)} />
              </div>
              <div className="space-y-2">
                <FieldLabel>Уверенность врача</FieldLabel>
                <ChipGroup
                  options={CONFIDENCE_OPTIONS}
                  value={chips.confidence}
                  onChange={(v) => setChip("confidence", v)}
                />
              </div>
            </div>
          </ConclusionSubsection>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <FieldLabel>Маршрут</FieldLabel>
              <ChipGroup
                options={RECOMMENDATION_OPTIONS}
                value={chips.recommendation}
                onChange={(v) => setChip("recommendation", v)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <FieldLabel>Этап скрининга</FieldLabel>
              <ChipGroup options={VISIT_OPTIONS} value={chips.visit} onChange={(v) => setChip("visit", v)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <FieldLabel>Примечания</FieldLabel>
              <Textarea rows={3} {...form.register("notes")} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {uploadProgress && <p className="text-sm text-hub-muted sm:mr-auto">{uploadProgress}</p>}
        <Button type="submit" size="lg" disabled={sessionStatus === "loading"}>
          Отправить в регистр
        </Button>
      </div>
    </form>
  );
}

function NewCasePageInner() {
  const searchParams = useSearchParams();
  const fromCaseId = searchParams.get("from") ?? "";
  const { data: session, status: sessionStatus } = useSession();

  const { data: templateCase } = useQuery({
    queryKey: ["case-template", fromCaseId],
    queryFn: () => apiFetch<CaseDetail>(`cases/${fromCaseId}`),
    enabled: !!fromCaseId && sessionStatus === "authenticated",
  });

  return (
    <NewCaseForm
      fromCaseId={fromCaseId}
      templateCase={templateCase}
      sessionStatus={sessionStatus}
      session={session}
    />
  );
}

export default function NewCasePage() {
  return (
    <Suspense fallback={<p className="p-6 text-hub-muted">Загрузка…</p>}>
      <NewCasePageInner />
    </Suspense>
  );
}
