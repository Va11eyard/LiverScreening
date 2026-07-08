"use client";

import { Download } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, avg, type SurveyRecord } from "@/lib/api";
import { userErrorMessage } from "@/lib/api-errors";
import { PILOT_HOSPITALS, SURVEY_QUESTIONS } from "@/lib/constants";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Label className="text-sm font-medium text-hub-heading">{children}</Label>;
}

export default function SurveyPage() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hospital, setHospital] = useState(session?.user?.hospital ?? PILOT_HOSPITALS[0]);
  const [scores, setScores] = useState<number[]>(Array(12).fill(0));
  const [comment, setComment] = useState("");

  const { data: surveys = [] } = useQuery({
    queryKey: ["surveys"],
    enabled: isAuthenticated,
    queryFn: () => apiFetch<SurveyRecord[]>("surveys"),
  });

  function setScore(index: number, value: number) {
    setScores((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  async function submit() {
    if (!isAuthenticated) return;
    if (!hospital || scores.some((s) => s < 1)) {
      toast.error("Заполните все оценки (1–5) и больницу");
      return;
    }
    const ux = avg(scores.slice(0, 5));
    const clinical = avg(scores.slice(5, 9));
    const process = avg(scores.slice(9, 12));
    const total = avg(scores);
    try {
      await apiFetch("surveys", {
        method: "POST",
        body: JSON.stringify({
          date,
          hospital,
          scores,
          ux_avg: ux,
          clinical_avg: clinical,
          process_avg: process,
          total_avg: total,
          comment,
        }),
      });
      toast.success("Анкета отправлена");
      setScores(Array(12).fill(0));
      setComment("");
      qc.invalidateQueries({ queryKey: ["surveys"] });
    } catch (e) {
      toast.error(userErrorMessage(e, "Ошибка отправки"));
    }
  }

  async function downloadExcel() {
    if (!isAuthenticated) return;
    try {
      const res = await fetch("/api/proxy/reports/survey-excel", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Не удалось скачать отчёт");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LiverScreening_Survey_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel скачан");
    } catch (e) {
      toast.error(userErrorMessage(e, "Не удалось скачать отчёт"));
    }
  }

  const sections = [
    { title: "1. Удобство использования", from: 0, to: 5 },
    { title: "2. Клиническая ценность", from: 5, to: 9 },
    { title: "3. Рабочий процесс", from: 9, to: 12 },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Продуктовые метрики"
        description="Заполняйте 1 раз в неделю. Шкала 1–5."
        action={
          <Button variant="navy" onClick={downloadExcel} disabled={!isAuthenticated}>
            <Download className="mr-2 h-4 w-4" />
            Скачать Excel
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel>Дата</FieldLabel>
            <DateField value={date} onChange={setDate} />
          </div>
          <div className="space-y-2">
            <FieldLabel>Больница</FieldLabel>
            <Select value={hospital} onValueChange={(v) => setHospital(v ?? PILOT_HOSPITALS[0])}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите больницу" />
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

      {sections.map((sec) => (
        <Card key={sec.title}>
          <CardHeader>
            <CardTitle>{sec.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {SURVEY_QUESTIONS.slice(sec.from, sec.to).map((q, i) => {
              const idx = sec.from + i;
              return (
                <div
                  key={q}
                  className="flex flex-col gap-2 border-b border-(--odos-hub-divider) pb-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm text-hub-body">{q}</span>
                  <StarRating value={scores[idx]} onChange={(v) => setScore(idx, v)} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <div className="space-y-2">
        <FieldLabel>Что улучшить в первую очередь?</FieldLabel>
        <Textarea
          rows={3}
          placeholder="Опишите, что мешает работе или что улучшить в первую очередь"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      <Button onClick={submit}>Отправить анкету</Button>

      <Card>
        <CardHeader>
          <CardTitle>История анкет ({surveys.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Больница</TableHead>
                <TableHead>Удобство</TableHead>
                <TableHead>Клин.</TableHead>
                <TableHead>Процесс</TableHead>
                <TableHead>Итого</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {surveys.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.date}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{s.hospital}</TableCell>
                  <TableCell>{s.ux_avg}</TableCell>
                  <TableCell>{s.clinical_avg}</TableCell>
                  <TableCell>{s.process_avg}</TableCell>
                  <TableCell className="font-semibold text-hub-cta">{s.total_avg}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
