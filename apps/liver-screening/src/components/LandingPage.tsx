import {
  ArrowRight,
  Clock3,
  FileText,
  HeartPulse,
  MessageCircle,
  Shield,
  Sparkles,
  Stethoscope,
  TestTube2,
} from "lucide-react";

import { ProtocolChatPanel } from "@/components/ProtocolChatPanel";
import { useProtocolChat } from "@/components/protocol-chat-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = {
  onStart: () => void;
};

const STEPS = [
  { n: "01", title: "Ответьте на вопросы", text: "Возраст, анализы, факторы риска — 2–3 минуты." },
  { n: "02", title: "Получите FIB-4 / APRI", text: "InLab-логика и серология HBV/HCV по AASLD." },
  { n: "03", title: "Узнайте тактику", text: "Рекомендации со ссылкой на протокол МЗ РК." },
] as const;

const FEATURES = [
  {
    icon: Shield,
    title: "Скрининг за 3 минуты",
    text: "Анонимная проверка факторов риска болезни печени и вирусного гепатита — без регистрации.",
    accent: "from-emerald-500/20 to-emerald-500/5",
  },
  {
    icon: TestTube2,
    title: "InLab-логика",
    text: "FIB-4, APRI и серология HBV/HCV по правилам AASLD и протоколам МЗ РК.",
    accent: "from-hub-cta/25 to-hub-cta/5",
  },
  {
    icon: Stethoscope,
    title: "Протоколы МЗ РК",
    text: "№523 МАСЖБП, №1082 АБП, №1071 ХВГ-B, №1056 ХВГ-C — в чате и рекомендациях.",
    accent: "from-violet-500/20 to-violet-500/5",
  },
] as const;

const PROTOCOLS = [
  { code: "1071", title: "ХВГ-B у взрослых", color: "border-l-violet-500" },
  { code: "1056", title: "ХВГ-C у взрослых", color: "border-l-indigo-500" },
  { code: "523", title: "МАСЖБП (НАЖБП)", color: "border-l-emerald-500" },
  { code: "1082", title: "Алкогольная болезнь печени", color: "border-l-amber-500" },
] as const;

const STATS = [
  { value: "3 мин", label: "на проверку" },
  { value: "4", label: "протокола МЗ РК" },
  { value: "FIB-4", label: "и APRI" },
] as const;

export function LandingPage({ onStart }: Props) {
  const { openChat } = useProtocolChat();

  return (
    <div className="min-h-screen bg-hub-page">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-hub-navy/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-lg">🫙</span>
            <div>
              <p className="text-sm font-bold text-white">LiverScreening</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/60">cornea.kz · InLab</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openChat}
              className="hidden border-white/20 bg-white/5 text-white hover:bg-white/10 sm:inline-flex"
            >
              <MessageCircle className="size-4" />
              Чат
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onStart}
              className="bg-white text-hub-cta shadow-auth-card hover:bg-white/95"
            >
              Начать
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-linear-to-br from-hub-navy via-[#163a5c] to-[#0a7ab5] text-white">
        <div className="landing-orb landing-orb-a pointer-events-none absolute -right-24 top-10 size-80 rounded-full bg-hub-cta/30 blur-3xl" />
        <div className="landing-orb landing-orb-b pointer-events-none absolute -left-20 bottom-0 size-72 rounded-full bg-white/10 blur-3xl" />
        <div className="landing-orb landing-orb-c pointer-events-none absolute right-1/3 top-1/2 size-48 rounded-full bg-emerald-400/10 blur-2xl" />

        <div className="relative mx-auto grid max-w-5xl gap-10 px-4 py-14 lg:grid-cols-2 lg:items-center lg:py-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm">
              <Sparkles className="size-3.5 text-amber-300" />
              Скрининг печени и ХВГ · ПМСП Казахстана
            </p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Полюбите
              <span className="block bg-linear-to-r from-white via-sky-100 to-cyan-200 bg-clip-text text-transparent">
                свою печень
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-white/85 sm:text-lg">
              InLab-формат: быстрый скрининг, интерпретация лабораторных показателей и ответы по клиническим
              протоколам МЗ РК — без регистрации.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                size="lg"
                onClick={onStart}
                className="min-w-[220px] gap-2 bg-white text-hub-cta shadow-auth-card hover:bg-white/95"
              >
                Начать проверку
                <ArrowRight className="size-4" />
              </Button>
              <button
                type="button"
                onClick={openChat}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
              >
                <MessageCircle className="size-4" />
                Спросить чат по протоколам
              </button>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-3">
              {STATS.map(({ value, label }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center backdrop-blur-sm"
                >
                  <p className="text-lg font-bold tabular-nums">{value}</p>
                  <p className="text-[11px] text-white/70">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="landing-float relative mx-auto w-full max-w-md">
            <Card className="border-0 bg-white/95 p-5 shadow-auth-card backdrop-blur">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-linear-to-br from-hub-cta to-hub-cta-light text-white">
                  <HeartPulse className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-hub-muted">InLab preview</p>
                  <p className="text-sm font-bold text-hub-heading">Пример результата</p>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-(--odos-hub-cta-tint-10) px-3 py-2.5">
                  <p className="text-xs text-hub-muted">FIB-4</p>
                  <p className="font-semibold text-hub-heading">1.42 · серая зона</p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
                  <p className="text-xs text-emerald-700/80">HBV / HCV</p>
                  <p className="font-semibold text-emerald-900">Серология в норме</p>
                </div>
                <p className="rounded-xl border border-(--odos-input-border) bg-hub-page px-3 py-2.5 text-xs leading-relaxed text-hub-body">
                  Согласно протоколу №523 (МАСЖБП) — контроль метаболических факторов и повторная оценка через
                  6–12 мес.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-hub-muted">
                <Clock3 className="size-3.5" />
                ~3 минуты · анонимно
              </div>
            </Card>
          </div>
        </div>

        <div className="landing-wave pointer-events-none text-hub-page" aria-hidden>
          <svg viewBox="0 0 1440 80" className="block w-full" preserveAspectRatio="none">
            <path
              fill="currentColor"
              d="M0,40 C240,80 480,0 720,40 C960,80 1200,0 1440,40 L1440,80 L0,80 Z"
            />
          </svg>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-hub-cta">Как это работает</p>
          <h2 className="mt-2 text-2xl font-bold text-hub-heading">Три шага InLab-скрининга</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ n, title, text }) => (
            <Card key={n} className="landing-card border-0 p-5 shadow-results-card">
              <p className="text-3xl font-black text-hub-cta/20">{n}</p>
              <h3 className="mt-1 text-sm font-bold text-hub-heading">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-hub-muted">{text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid gap-4 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text, accent }) => (
              <Card key={title} className={`landing-card border-0 bg-linear-to-b ${accent} p-5 shadow-results-card`}>
                <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-white text-hub-cta shadow-sm">
                  <Icon className="size-5" />
                </div>
                <h2 className="text-sm font-bold text-hub-heading">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-hub-muted">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-hub-cta">МЗ РК</p>
            <h2 className="mt-2 text-2xl font-bold text-hub-heading">Клинические протоколы</h2>
          </div>
          <FileText className="hidden size-8 text-hub-cta/40 sm:block" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROTOCOLS.map(({ code, title, color }) => (
            <Card
              key={code}
              className={`landing-card border-0 border-l-4 ${color} p-4 shadow-results-card`}
            >
              <p className="text-xs font-semibold text-hub-cta">Протокол №{code}</p>
              <p className="mt-1 text-sm font-medium text-hub-heading">{title}</p>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-hub-muted">
          Чат-ассистент отвечает со ссылкой «согласно протоколу №…». Это информационная поддержка, не замена
          врача.
        </p>
      </section>

      <section className="bg-linear-to-b from-hub-page to-white px-4 py-14">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-hub-heading">Чат по клиническим протоколам</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-hub-muted">
              Спросите про ХВГ-B/C, FIB-4, APRI или тактику наблюдения — ассистент ответит со ссылкой на
              протокол.
            </p>
          </div>
          <div id="protocol-chat" className="scroll-mt-20">
            <ProtocolChatPanel embedded className="mx-auto max-w-2xl shadow-auth-card" />
          </div>
        </div>
      </section>

      <section className="border-t border-(--odos-input-border) bg-hub-navy px-4 py-10 text-center text-white">
        <p className="text-lg font-semibold">Готовы проверить риск?</p>
        <p className="mt-1 text-sm text-white/70">Бесплатно · анонимно · 3 минуты</p>
        <Button
          type="button"
          size="lg"
          onClick={onStart}
          className="mt-5 min-w-[220px] bg-white text-hub-cta hover:bg-white/95"
        >
          Начать проверку
        </Button>
        <p className="mt-8 text-xs text-white/50">
          Проект LiverScreening · ПМСП ·{" "}
          <a href="https://platform.cornea.kz" className="text-sky-300 hover:underline">
            platform.cornea.kz
          </a>
        </p>
      </section>
    </div>
  );
}
