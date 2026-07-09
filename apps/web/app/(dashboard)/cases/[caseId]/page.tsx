"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Download, Pencil, Stethoscope, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CaseImagePreview } from "@/components/case-image-preview";
import { CaseImageUpload } from "@/components/case-image-upload";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, downloadBlob, patientLabel, type CaseDetail } from "@/lib/api";
import { mapApiErrorMessage, userErrorMessage } from "@/lib/api-errors";
import { uploadCaseImagesBatched, MAX_IMAGES_PER_CASE } from "@/lib/upload-images";
import { formatDate } from "@/lib/format-date";

type CompareFieldKey = "stage" | "plusDisease" | "zone" | "ropForm" | "preDiag" | "aprop";

const COMPARE_FIELDS: { key: CompareFieldKey; label: string; aiKey: string }[] = [
  { key: "stage", label: "Фиброз (F)", aiKey: "stage" },
  { key: "plusDisease", label: "Стеатоз", aiKey: "plusDisease" },
  { key: "zone", label: "Триаж", aiKey: "zone" },
  { key: "ropForm", label: "Морфология", aiKey: "ropForm" },
  { key: "preDiag", label: "Клинический диагноз", aiKey: "preDiag" },
  { key: "aprop", label: "ХВГ", aiKey: "aprop" },
];

type AISnapshot = {
  status?: string;
  suggestions?: Record<string, unknown>;
  analyzed_at?: string;
  error?: string;
};

type DetailItem = { label: string; value?: string | number | null };

function display(value?: string | number | null) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

function DetailGrid({ items }: { items: DetailItem[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-xs font-medium text-hub-muted">{label}</dt>
          <dd className="mt-1 text-sm text-hub-heading">{display(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function aiMatchBadge(match?: string | null) {
  if (!match) return null;
  if (match === "Совпадает") return <Badge variant="success">{match}</Badge>;
  if (match === "Расхождение") return <Badge variant="destructive">{match}</Badge>;
  return <Badge variant="warning">{match}</Badge>;
}

function parseSnapshot(raw: CaseDetail["ai_snapshot"]): AISnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const snap = raw as AISnapshot;
  if (snap.suggestions && typeof snap.suggestions === "object") {
    const s = snap.suggestions as Record<string, unknown>;
    return {
      ...snap,
      suggestions: {
        stage: String(s.stage ?? ""),
        plusDisease: String(s.plus_disease ?? s.plusDisease ?? ""),
        zone: String(s.zone ?? ""),
        ropForm: String(s.rop_form ?? s.ropForm ?? ""),
        preDiag: String(s.pre_diag ?? s.preDiag ?? ""),
        aprop: String(s.aprop ?? ""),
        confidence: String(s.confidence ?? ""),
        explanation: s.explanation,
        findings: s.findings,
        fib4: s.fib4,
        apri: s.apri,
      },
    };
  }
  return snap;
}

function caseSections(detail: CaseDetail): { title: string; items: DetailItem[] }[] {
  return [
    {
      title: "Пациент и анализы",
      items: [
        { label: "Фамилия", value: detail.motherSurname },
        { label: "ИИН / ID", value: detail.childSurname },
        { label: "Возраст", value: detail.ga },
        { label: "Тромбоциты", value: detail.bw },
        { label: "АЛТ", value: detail.pca },
        { label: "АСТ", value: detail.ph },
        { label: "Этиология", value: detail.eye },
        { label: "ХВГ", value: detail.aprop },
        { label: "Коморбидности", value: detail.riskFactors },
      ],
    },
    {
      title: "УЗИ",
      items: [
        { label: "Аппарат", value: detail.camera },
        { label: "Качество", value: detail.imageQuality },
        { label: "Морфология", value: detail.ropForm },
      ],
    },
    {
      title: "Заключение и триаж",
      items: [
        { label: "Стеатоз", value: detail.plusDisease },
        { label: "Фиброз", value: detail.stage },
        { label: "Клинический диагноз", value: detail.preDiag },
        { label: "Риск / тактика", value: detail.zone },
        { label: "Рекомендация", value: detail.recommendation },
        { label: "Визит", value: detail.visit },
      ],
    },
  ];
}

const SOFT_DELETE_HINT =
  "Данные будут скрыты из отчётов и интерфейса, но сохранены на сервере для восстановления и аудита.";

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const caseId = typeof params.caseId === "string" ? params.caseId : "";
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const isCoordinator = session?.user?.role === "coordinator" || session?.user?.role === "admin";
  const isDoctor = session?.user?.role === "doctor";
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editStage, setEditStage] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPreDiag, setEditPreDiag] = useState("");

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ["case", caseId],
    enabled: isAuthenticated && !!caseId,
    queryFn: () => apiFetch<CaseDetail>(`cases/${caseId}`),
  });

  const snapshot = detail ? parseSnapshot(detail.ai_snapshot) : null;
  const aiSuggestions = (snapshot?.suggestions ?? {}) as Record<string, unknown>;
  const hasAI = snapshot?.status === "ok" && Object.keys(aiSuggestions).length > 0;

  async function downloadAllImages() {
    if (!caseId) return;
    try {
      await downloadBlob(`cases/${caseId}/images/archive`, {
        filename: `LiverScreening_${caseId}_images.zip`,
      });
      toast.success("Снимки скачаны");
    } catch (e) {
      toast.error(userErrorMessage(e, "Не удалось скачать снимки"));
    }
  }

  async function downloadImage(imageId: string, filename: string) {
    if (!caseId) return;
    try {
      await downloadBlob(`cases/${caseId}/images/${imageId}/file?download=1`, { filename });
      toast.success("Файл скачан");
    } catch (e) {
      toast.error(userErrorMessage(e, "Не удалось скачать файл"));
    }
  }

  async function uploadMoreImages() {
    if (!caseId || extraFiles.length === 0) return;
    const existing = detail?.images?.length ?? 0;
    if (existing + extraFiles.length > MAX_IMAGES_PER_CASE) {
      toast.error(`Максимум ${MAX_IMAGES_PER_CASE} снимков на карту`);
      return;
    }
    setUploading(true);
    try {
      await uploadCaseImagesBatched(caseId, extraFiles);
      setExtraFiles([]);
      await queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      toast.success("Снимки добавлены");
    } catch (e) {
      toast.error(userErrorMessage(e, "Не удалось загрузить снимки"));
    } finally {
      setUploading(false);
    }
  }

  const remainingSlots = MAX_IMAGES_PER_CASE - (detail?.images?.length ?? 0);

  function startEditing() {
    if (!detail) return;
    setEditStage(detail.stage ?? "");
    setEditNotes(detail.notes ?? "");
    setEditPreDiag(detail.preDiag ?? "");
    setEditing(true);
  }

  async function saveEdits() {
    if (!caseId) return;
    try {
      await apiFetch(`cases/${caseId}`, {
        method: "PATCH",
        body: JSON.stringify({
          stage: editStage,
          notes: editNotes,
          preDiag: editPreDiag,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      setEditing(false);
      toast.success("Карта обновлена");
    } catch (e) {
      toast.error(userErrorMessage(e, "Не удалось сохранить"));
    }
  }

  async function deleteImage(imageId: string, name: string) {
    if (!caseId) return;
    if (
      !window.confirm(
        `Удалить снимок «${name}»?\n\n${SOFT_DELETE_HINT}`,
      )
    ) {
      return;
    }
    try {
      await apiFetch(`cases/${caseId}/images/${imageId}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      toast.success("Снимок удалён");
    } catch (e) {
      toast.error(userErrorMessage(e, "Не удалось удалить снимок"));
    }
  }

  async function deleteCase() {
    if (!caseId) return;
    if (
      !window.confirm(
        `Удалить карту ${caseId} и все снимки?\n\n${SOFT_DELETE_HINT}`,
      )
    ) {
      return;
    }
    try {
      await apiFetch(`cases/${caseId}`, { method: "DELETE" });
      toast.success("Карта удалена");
      router.push("/cases");
    } catch (e) {
      toast.error(userErrorMessage(e, "Не удалось удалить карту"));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/cases">
            <ArrowLeft className="mr-1 h-4 w-4" />
            К списку
          </Link>
        </Button>
        {detail && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/cases/new?from=${encodeURIComponent(caseId)}`}>
              <Pencil className="mr-1 h-4 w-4" />
              Новый осмотр
            </Link>
          </Button>
        )}
        {detail && (isDoctor || isCoordinator) ? (
          <Button variant="destructive" size="sm" onClick={deleteCase}>
            <Trash2 className="mr-1 h-4 w-4" />
            Удалить карту
          </Button>
        ) : null}
      </div>

      <PageHeader
        title={caseId}
        description={detail ? `${detail.hospital} · ${detail.date} · ${detail.doctor}` : "Загрузка карты…"}
      />

      {isLoading && <p className="text-hub-muted">Загрузка…</p>}
      {error && <p className="text-destructive">Не удалось загрузить карту</p>}

      {detail && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{patientLabel(detail.motherSurname, detail.childSurname)}</Badge>
            {detail.stage && <Badge>{detail.stage}</Badge>}
            {aiMatchBadge(detail.aiMatch)}
          </div>

          {caseSections(detail).map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle className="text-base">{section.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailGrid items={section.items} />
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Stethoscope className="h-4 w-4" />
                Врач vs ИИ
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0 pb-4">
              {snapshot?.status === "error" && (
                <p className="px-6 pb-4 text-sm text-hub-muted">
                  ИИ-анализ недоступен: {mapApiErrorMessage(String(snapshot.error ?? ""))}
                </p>
              )}
              {!hasAI && snapshot?.status !== "error" && (
                <p className="px-6 pb-4 text-sm text-hub-muted">
                  ИИ-анализ ещё не выполнялся для этой карты. Ниже — ключевые поля врача.
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Поле</TableHead>
                    <TableHead>Заключение врача</TableHead>
                    <TableHead className="flex items-center gap-1">
                      <Bot className="h-3.5 w-3.5" />
                      ИИ предполагает
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COMPARE_FIELDS.map(({ key, label, aiKey }) => {
                    const doctorVal = display(detail[key]);
                    const aiVal = hasAI ? display(String(aiSuggestions[aiKey] ?? "")) : "—";
                    const differs = hasAI && doctorVal !== "—" && aiVal !== "—" && doctorVal !== aiVal;
                    return (
                      <TableRow key={key}>
                        <TableCell className="font-medium">{label}</TableCell>
                        <TableCell>{doctorVal}</TableCell>
                        <TableCell className={differs ? "text-amber-700 dark:text-amber-400" : undefined}>
                          {aiVal}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {hasAI && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Тестирование модели</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-hub-muted">
                  Визуализация зоны патологии и эксперименты с моделью — в отдельном ML Lab (прототип).
                </p>
                <Button type="button" variant="outline" asChild>
                  <a href="http://localhost:3005" target="_blank" rel="noreferrer">
                    Открыть ML Lab
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle className="text-base">УЗИ-снимки ({detail.images?.length ?? 0})</CardTitle>
              {isCoordinator && !!detail.images?.length && (
                <Button variant="outline" size="sm" onClick={downloadAllImages}>
                  <Download className="mr-1 h-4 w-4" />
                  Скачать все
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!detail.images?.length ? (
                <p className="text-sm text-hub-muted">Снимки не прикреплены</p>
              ) : (
                <ul className="space-y-4">
                  {detail.images.map((img) => (
                    <li
                      key={img.id}
                      className="flex flex-col gap-3 border-b border-border/60 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center"
                    >
                      {img.mime_type.startsWith("image/") ? (
                        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30">
                          <CaseImagePreview
                            caseId={caseId}
                            imageId={img.id}
                            alt={img.original_name}
                            className="h-28 w-28 object-cover"
                          />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{img.original_name}</p>
                        <p className="text-xs text-hub-muted">
                          {Math.round(img.size_bytes / 1024)} КБ · загружен {formatDate(img.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadImage(img.id, img.original_name)}
                        >
                          <Download className="mr-1 h-4 w-4" />
                          Скачать
                        </Button>
                        {isDoctor ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteImage(img.id, img.original_name)}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Удалить
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {isDoctor && remainingSlots > 0 ? (
                <div className="mt-6 space-y-4 border-t border-border/60 pt-6">
                  <p className="text-sm font-medium text-hub-heading">
                    Добавить снимки (ещё {remainingSlots})
                  </p>
                  <CaseImageUpload
                    files={extraFiles}
                    onChange={setExtraFiles}
                    maxFiles={remainingSlots}
                  />
                  <Button type="button" onClick={uploadMoreImages} disabled={uploading || extraFiles.length === 0}>
                    {uploading ? "Загрузка…" : "Загрузить снимки"}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {isDoctor ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                <CardTitle className="text-base">Протокол осмотра</CardTitle>
                {!editing ? (
                  <Button type="button" variant="outline" size="sm" onClick={startEditing}>
                    <Pencil className="mr-1 h-4 w-4" />
                    Редактировать
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {editing ? (
                  <>
                    <div className="space-y-2">
                      <Label>Стадия фиброза</Label>
                      <Input value={editStage} onChange={(e) => setEditStage(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Предв. диагноз</Label>
                      <Input value={editPreDiag} onChange={(e) => setEditPreDiag(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Примечания</Label>
                      <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={4} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" onClick={saveEdits}>
                        Сохранить
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                        Отмена
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-hub-muted">
                    Стадия: {detail.stage || "—"} · Диагноз: {detail.preDiag || "—"}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {detail.notes && !editing ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Примечания</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{detail.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
