"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  apiFetch,
  downloadBlob,
  reportQuery,
  type HospitalReportRow,
  type ReportFilters,
  type StageReportRow,
  type WeeklyReportRow,
} from "@/lib/api";
import { userErrorMessage } from "@/lib/api-errors";
import { PILOT_HOSPITALS, STAGES } from "@/lib/constants";
import { calcFib4 } from "@/lib/fib4";

function stageBadge(stage?: string) {
  if (!stage) return "—";
  if (stage === "F4") return <Badge variant="destructive">{stage}</Badge>;
  if (stage === "F2" || stage === "F3") return <Badge variant="warning">{stage}</Badge>;
  if (stage === "F0" || stage === "F1") return <Badge variant="success">{stage}</Badge>;
  return <Badge variant="secondary">{stage}</Badge>;
}

function usConclusion(row: WeeklyReportRow): string {
  const fromDiag = ["Норма", "Стеатоз", "Фиброз", "Цирроз"];
  if (row.pre_diag && fromDiag.includes(row.pre_diag)) return row.pre_diag;
  if (row.stage === "F4") return "Цирроз";
  if (row.stage === "F2" || row.stage === "F3") return "Фиброз";
  if (
    row.plus_disease &&
    row.plus_disease !== "Нет / минимальный" &&
    row.plus_disease !== "Нет"
  ) {
    return "Стеатоз";
  }
  if (row.rop_form === "Норма") return "Норма";
  return "—";
}

function formatAvg(value?: number | null) {
  if (value == null) return "—";
  return value.toFixed(1);
}

export default function CasesPage() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const isCoordinator = session?.user?.role === "coordinator" || session?.user?.role === "admin";

  const [filters, setFilters] = useState<ReportFilters>({
    hospital: "",
    dateFrom: "",
    dateTo: "",
    patient: "",
    stage: "",
    aprop: false,
  });

  const querySuffix = reportQuery(filters);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["weekly-report", filters],
    enabled: isAuthenticated,
    queryFn: () => apiFetch<WeeklyReportRow[]>(`reports/weekly${querySuffix}`),
  });

  const { data: stageRows = [], isLoading: stagesLoading } = useQuery({
    queryKey: ["stage-report", filters],
    enabled: isAuthenticated && isCoordinator,
    queryFn: () => apiFetch<StageReportRow[]>(`reports/stages${querySuffix}`),
  });

  const { data: hospitalRows = [], isLoading: hospitalsLoading } = useQuery({
    queryKey: ["hospital-report", filters],
    enabled: isAuthenticated && isCoordinator,
    queryFn: () => apiFetch<HospitalReportRow[]>(`reports/hospitals${querySuffix}`),
  });

  const stats = {
    total: rows.length,
    hbv: rows.filter((r) => r.aprop === "Да (ХВГ)").length,
    highRisk: rows.filter(
      (r) => r.plus_disease === "Умеренный" || r.plus_disease === "Выраженный",
    ).length,
    doubtful: rows.filter((r) => r.confidence === "Сомневаюсь").length,
  };

  async function downloadExcel() {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(`/api/proxy/reports/excel${querySuffix}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Не удалось скачать отчёт");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LiverScreening_Weekly_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel скачан");
    } catch (e) {
      toast.error(userErrorMessage(e, "Не удалось скачать отчёт"));
    }
  }

  async function downloadImages(caseId: string) {
    if (!isAuthenticated) return;
    try {
      await downloadBlob(`cases/${caseId}/images/archive`, {
        filename: `LiverScreening_${caseId}_images.zip`,
      });
      toast.success("Снимки скачаны");
    } catch (e) {
      toast.error(userErrorMessage(e, "Не удалось скачать снимки"));
    }
  }

  async function downloadTrainingExport() {
    if (!isAuthenticated) return;
    try {
      await downloadBlob(`reports/training-export${querySuffix}`, {
        filename: `LiverScreening_Training_${new Date().toISOString().slice(0, 10)}.zip`,
      });
      toast.success("Экспорт для ML скачан");
    } catch (e) {
      toast.error(userErrorMessage(e, "Не удалось скачать экспорт"));
    }
  }

  const colSpan = isCoordinator ? 15 : 14;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Еженедельный отчёт"
        description="Сводка карт пациентов за период"
        action={
          <>
            <Button variant="outline" asChild>
              <Link href="/cases/new">+ Новая карта</Link>
            </Button>
            {isCoordinator ? (
              <>
                <Button variant="outline" onClick={downloadTrainingExport}>
                  <Download className="mr-2 h-4 w-4" />
                  ML экспорт
                </Button>
                <Button variant="navy" onClick={downloadExcel}>
                  <Download className="mr-2 h-4 w-4" />
                  Скачать Excel
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-sm font-medium text-hub-heading">Фамилия пациента</Label>
            <Input
              placeholder="Иванова"
              value={filters.patient ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, patient: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-1">
            <Label className="text-sm font-medium text-hub-heading">ПМСП</Label>
            <Select
              value={filters.hospital || "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, hospital: v === "all" ? "" : (v ?? "") }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Все ПМСП" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все ПМСП</SelectItem>
                {PILOT_HOSPITALS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-hub-heading">Дата с</Label>
            <DateField
              value={filters.dateFrom ?? ""}
              onChange={(dateFrom) => setFilters((f) => ({ ...f, dateFrom }))}
              toYmd={filters.dateTo || undefined}
              placeholder="Дата с"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-hub-heading">Дата по</Label>
            <DateField
              value={filters.dateTo ?? ""}
              onChange={(dateTo) => setFilters((f) => ({ ...f, dateTo }))}
              fromYmd={filters.dateFrom || undefined}
              placeholder="Дата по"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-hub-heading">Стадия фиброза</Label>
            <Select
              value={filters.stage || "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, stage: v === "all" ? "" : (v ?? "") }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Все стадии" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все стадии</SelectItem>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-hub-heading">
              <input
                type="checkbox"
                checked={!!filters.aprop}
                onChange={(e) => setFilters((f) => ({ ...f, aprop: e.target.checked }))}
                className="size-4 rounded border-border"
              />
              Только ХВГ
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Всего кейсов" value={stats.total} />
        <KpiCard title="ХВГ" value={stats.hbv} variant="danger" />
        <KpiCard title="Высокий риск (стеатоз)" value={stats.highRisk} variant="warning" />
        <KpiCard title="Сомневаются" value={stats.doubtful} />
      </div>

      {isCoordinator ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Стадии фиброза</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0 pb-4">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Стадия</TableHead>
                    <TableHead>Кол-во</TableHead>
                    <TableHead>Высокий риск</TableHead>
                    <TableHead>К гепатологу</TableHead>
                    <TableHead>Ср. возраст</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stagesLoading && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-hub-muted">
                        Загрузка…
                      </TableCell>
                    </TableRow>
                  )}
                  {!stagesLoading &&
                    stageRows.map((r) => (
                      <TableRow key={r.stage} className={r.stage === "ИТОГО" ? "font-semibold" : undefined}>
                        <TableCell>{r.stage}</TableCell>
                        <TableCell>{r.count}</TableCell>
                        <TableCell>{r.plus_disease}</TableCell>
                        <TableCell>{r.aggressive}</TableCell>
                        <TableCell>{formatAvg(r.avg_ga)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Сводка по больницам</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0 pb-4">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Больница</TableHead>
                    <TableHead>Всего</TableHead>
                    <TableHead>Норма</TableHead>
                    <TableHead>F0–F1</TableHead>
                    <TableHead>F2–F3</TableHead>
                    <TableHead>F4/Цирроз</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hospitalsLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-hub-muted">
                        Загрузка…
                      </TableCell>
                    </TableRow>
                  )}
                  {!hospitalsLoading &&
                    hospitalRows.map((r) => (
                      <TableRow key={r.hospital} className={r.hospital === "ИТОГО" ? "font-semibold" : undefined}>
                        <TableCell className="max-w-[160px] truncate" title={r.hospital}>
                          {r.hospital}
                        </TableCell>
                        <TableCell>{r.total}</TableCell>
                        <TableCell>{r.rop_detected}</TableCell>
                        <TableCell>{r.stages_1_2}</TableCell>
                        <TableCell>{r.stages_3_5}</TableCell>
                        <TableCell>{r.plus_disease}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardContent className="overflow-x-auto p-0 pt-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>ID кейса</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>ПМСП</TableHead>
                <TableHead>Врач</TableHead>
                <TableHead>Пациент</TableHead>
                <TableHead>Возраст</TableHead>
                <TableHead>Этиология</TableHead>
                <TableHead>FIB-4</TableHead>
                <TableHead>УЗИ-заключение</TableHead>
                <TableHead>Стадия F0–F4</TableHead>
                <TableHead>Уверенность врача</TableHead>
                <TableHead>Совпадение с AI</TableHead>
                <TableHead>Маршрут</TableHead>
                <TableHead>Этап скрининга</TableHead>
                {isCoordinator ? <TableHead>Снимки</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center text-hub-muted">
                    Загрузка…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center text-hub-muted">
                    Карт пока нет
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.case_id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/cases/${r.case_id}`} className="text-hub-cta hover:underline">
                      {r.case_id}
                    </Link>
                  </TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell className="max-w-[160px] truncate" title={r.hospital}>
                    {r.hospital}
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate" title={r.doctor}>
                    {r.doctor}
                  </TableCell>
                  <TableCell>{r.patient_label || "—"}</TableCell>
                  <TableCell>{r.ga || "—"}</TableCell>
                  <TableCell>{r.etiology || "—"}</TableCell>
                  <TableCell>{calcFib4(r.ga, r.ph, r.pca, r.bw)}</TableCell>
                  <TableCell>{usConclusion(r)}</TableCell>
                  <TableCell>{stageBadge(r.stage)}</TableCell>
                  <TableCell>{r.confidence || "—"}</TableCell>
                  <TableCell>{r.ai_match ?? "—"}</TableCell>
                  <TableCell className="max-w-[120px] truncate" title={r.recommendation}>
                    {r.recommendation || "—"}
                  </TableCell>
                  <TableCell>{r.visit || "—"}</TableCell>
                  {isCoordinator ? (
                    <TableCell>
                      {(r.image_count ?? 0) > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 px-2"
                          onClick={() => downloadImages(r.case_id)}
                        >
                          <Download className="size-3.5" aria-hidden />
                          {r.image_count}
                        </Button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
