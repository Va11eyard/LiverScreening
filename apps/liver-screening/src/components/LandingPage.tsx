import { MessageCircle, Shield, Stethoscope, TestTube2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = {
  onStart: () => void;
};

const FEATURES = [
  {
    icon: Shield,
    title: "Скрининг за 3 минуты",
    text: "Анонимная проверка факторов риска болезни печени и вирусного гепатита — без регистрации.",
  },
  {
    icon: TestTube2,
    title: "InLab-логика",
    text: "FIB-4, APRI и серология HBV/HCV по правилам AASLD и протоколам МЗ РК.",
  },
  {
    icon: Stethoscope,
    title: "Протоколы МЗ РК",
    text: "№523 МАСЖБП, №1082 АБП, №1071 ХВГ-B, №1056 ХВГ-C — в чате и рекомендациях.",
  },
] as const;

export function LandingPage({ onStart }: Props) {
  return (
    <div className="min-h-screen bg-hub-page">
      <section className="relative overflow-hidden bg-linear-to-br from-hub-navy via-hub-cta to-[#0a7ab5] px-4 pb-16 pt-10 text-white">
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-64 rounded-full bg-white/5 blur-2xl" />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
            LiverScreening · cornea.kz
          </p>
          <div className="mb-4 text-5xl">🫙</div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Полюбите свою печень</h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/90 sm:text-lg">
            Узнайте риск болезни печени и ХВГ в формате InLab — скрининг, лабораторная интерпретация и
            ответы по клиническим протоколам Казахстана.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              type="button"
              size="lg"
              onClick={onStart}
              className="min-w-[220px] bg-white text-hub-cta shadow-auth-card hover:bg-white/95"
            >
              Начать проверку
            </Button>
            <a
              href="#protocols"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/90 underline-offset-4 hover:underline"
            >
              <MessageCircle className="size-4" />
              Спросить чат по протоколам
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="border-0 p-5 shadow-results-card">
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-(--odos-hub-cta-tint-10) text-hub-cta">
                <Icon className="size-5" />
              </div>
              <h2 className="text-sm font-bold text-hub-heading">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-hub-muted">{text}</p>
            </Card>
          ))}
        </div>

        <Card id="protocols" className="mt-8 border-0 p-6 shadow-results-card">
          <h2 className="text-lg font-bold text-hub-heading">Клинические протоколы в основе системы</h2>
          <ul className="mt-4 space-y-2 text-sm text-hub-body">
            <li>
              <strong>№1071</strong> — хронический вирусный гепатит B у взрослых
            </li>
            <li>
              <strong>№1056</strong> — хронический гепатит C у взрослых
            </li>
            <li>
              <strong>№523</strong> — МАСЖБП (неалкогольная жировая болезнь печени)
            </li>
            <li>
              <strong>№1082</strong> — алкогольная болезнь печени
            </li>
          </ul>
          <p className="mt-4 text-xs text-hub-muted">
            Чат-ассистент отвечает со ссылкой «согласно протоколу №…». Это информационная поддержка, не
            замена врача.
          </p>
        </Card>

        <p className="mt-10 text-center text-xs text-hub-muted">
          Проект LiverScreening · ПМСП ·{" "}
          <a href="https://platform.cornea.kz" className="text-hub-cta hover:underline">
            platform.cornea.kz
          </a>
        </p>
      </section>
    </div>
  );
}
