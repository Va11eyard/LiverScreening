import { useCallback, useState, type ReactNode } from "react";

import { ScreeningHeader } from "@/components/ScreeningHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  assess,
  buildSaveText,
  COLORS,
  DIET,
  DRINKS,
  HEP,
  type RiskLevel,
  type ScreeningAnswers,
} from "@/lib/liver-screening";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 6;

const OVERALL = [
  {
    em: "✅",
    t: "Низкий риск",
    c: COLORS.green,
    bg: COLORS.greenBg,
    badge: "success" as const,
    p: "Сейчас явных факторов риска болезни печени не видно. Так держать — здоровые привычки берегут печень.",
  },
  {
    em: "🟡",
    t: "Есть факторы риска",
    c: COLORS.amber,
    bg: COLORS.amberBg,
    badge: "warning" as const,
    p: "У вас есть моменты, повышающие риск. Это не диагноз, но стоит показаться врачу и при необходимости проверить печень.",
  },
  {
    em: "🔴",
    t: "Повышенный риск — к врачу",
    c: COLORS.red,
    bg: COLORS.redBg,
    badge: "danger" as const,
    p: "По одному или нескольким пунктам риск высокий. Обратитесь к врачу и попросите проверить печень — раннее выявление меняет всё.",
  },
] as const;

function riskVariant(lvl: RiskLevel): "success" | "warning" | "danger" {
  return lvl === 0 ? "success" : lvl === 1 ? "warning" : "danger";
}

function RadioGroup({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: [string, string][];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label={name}>
      {options.map(([label, v]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex w-full items-center justify-start rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition-colors",
            value === v
              ? "border-hub-cta bg-(--odos-hub-cta-tint-10) text-hub-cta"
              : "border-(--odos-input-border) bg-white text-hub-body hover:border-hub-cta/40 hover:bg-hub-page",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function StepCard({
  tag,
  title,
  lead,
  children,
  error,
  footer,
}: {
  tag: string;
  title: string;
  lead: string;
  children: ReactNode;
  error?: string;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <Badge variant="secondary" className="mb-3">
        {tag}
      </Badge>
      <h2 className="text-lg font-semibold text-hub-heading">{title}</h2>
      <p className="mt-1 text-sm text-hub-muted">{lead}</p>
      <div className="mt-4">{children}</div>
      {footer}
      {error ? <p className="mt-3 text-sm font-medium text-destructive">{error}</p> : null}
    </Card>
  );
}

function Question({ children }: { children: ReactNode }) {
  return <p className="mt-4 mb-2 text-sm font-semibold text-hub-heading">{children}</p>;
}

function NavButtons({
  onBack,
  onNext,
  nextLabel = "Далее",
  showBack = true,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  showBack?: boolean;
}) {
  return (
    <div className="mt-6 flex gap-3">
      {showBack && onBack ? (
        <Button type="button" variant="outline" onClick={onBack}>
          Назад
        </Button>
      ) : null}
      <Button type="button" size="lg" className="flex-1" onClick={onNext}>
        {nextLabel}
      </Button>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-(--odos-input-border) bg-white px-3.5 py-3 text-base text-hub-heading outline-none transition-colors placeholder:text-(--odos-input-placeholder) focus:border-hub-cta focus:ring-2 focus:ring-hub-cta/20";

export function LiverScreeningForm() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReturnType<typeof assess> | null>(null);

  const [age, setAge] = useState<string | null>(null);
  const [sex, setSex] = useState<string | null>(null);
  const [dm, setDm] = useState<string | null>(null);
  const [bp, setBp] = useState<string | null>(null);
  const [afreq, setAfreq] = useState<string | null>(null);
  const [adry, setAdry] = useState<string | null>(null);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [drinkCounts, setDrinkCounts] = useState<number[]>(() => DRINKS.map(() => 0));
  const [dietAns, setDietAns] = useState<Record<string, string>>({});
  const [hepAns, setHepAns] = useState<Record<string, string>>({});

  const goTo = useCallback((n: number) => {
    setStep(n);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  function setDiet(key: string, value: string) {
    setDietAns((prev) => ({ ...prev, [key]: value }));
  }

  function setHep(key: string, value: string) {
    setHepAns((prev) => ({ ...prev, [key]: value }));
  }

  function buildAnswers(): ScreeningAnswers {
    return {
      age,
      sex,
      dm,
      bp,
      afreq,
      adry,
      height: +height,
      weight: +weight,
      drinkCounts,
      dietAns,
      hepAns,
    };
  }

  function validateStep(): string | null {
    if (step === 1 && (!age || !sex)) return "Выберите возраст и пол.";
    if (step === 2) {
      const h = +height;
      const w = +weight;
      if (dm === null || bp === null || !(h > 0) || !(w > 0)) {
        return "Ответьте про диабет, давление и укажите рост и вес.";
      }
    }
    if (step === 3 && !afreq) return "Отметьте, как часто вы употребляете алкоголь.";
    if (step === 4 && Object.keys(dietAns).length < 5) {
      return "Ответьте на все вопросы о питании и движении.";
    }
    if (step === 5 && Object.keys(hepAns).length < HEP.length) {
      return "Ответьте на все вопросы этого шага.";
    }
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    goTo(step + 1);
  }

  function finish() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setResult(assess(buildAnswers()));
    goTo(6);
  }

  function reset() {
    window.location.reload();
  }

  function saveResult() {
    if (!result) return;
    const worst = Math.max(result.al.lvl, result.me.lvl, result.he.lvl);
    const text = buildSaveText(result, OVERALL[worst].t);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "результат_печень.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const worst = result ? Math.max(result.al.lvl, result.me.lvl, result.he.lvl) : 0;
  const overall = OVERALL[worst];

  const nextSteps: string[] = [];
  if (result) {
    if (worst === 0) {
      nextSteps.push("Продолжайте: движение, здоровое питание, умеренность с алкоголем.");
      nextSteps.push("Повторите проверку примерно раз в год.");
    } else {
      nextSteps.push(
        "Обратитесь к терапевту и попросите анализ крови на состояние печени (АЛТ, АСТ, тромбоциты — из них считают индекс FIB-4).",
      );
      if (result.al.lvl > 0) nextSteps.push("Сократите алкоголь и делайте несколько дней в неделю без него.");
      if (result.me.lvl > 0) {
        nextSteps.push("Постепенное снижение веса и больше движения заметно улучшают состояние печени.");
      }
      if (result.he.lvl > 0) nextSteps.push("Сдайте анализ на вирусные гепатиты B и C.");
      if (result.viralHepRisk) {
        nextSteps.push("Рекомендован лабораторный скрининг: HBsAg + Anti-HCV.");
      }
    }
  }

  return (
    <>
      <ScreeningHeader step={step} totalSteps={TOTAL_STEPS} />

      {step === 1 && (
        <StepCard
          tag="Шаг 1 · О вас"
          title="Немного о себе"
          lead="Болезнь печени на ранних стадиях обычно не имеет симптомов, но её можно вовремя обнаружить. Пройдите короткую проверку — возможно, это самое важное, что вы сделаете сегодня."
          error={error}
          footer={
            <>
              <NavButtons showBack={false} onNext={next} />
              <p className="mt-3 text-center text-xs text-hub-muted">
                Ответы анонимны и никуда не отправляются.
              </p>
            </>
          }
        >
          <Question>Ваш возраст</Question>
          <RadioGroup
            name="age"
            value={age}
            onChange={setAge}
            options={[
              ["18–25", "18-25"],
              ["26–40", "26-40"],
              ["41–60", "41-60"],
              ["Старше 60", "60+"],
            ]}
          />
          <Question>Пол</Question>
          <RadioGroup
            name="sex"
            value={sex}
            onChange={setSex}
            options={[
              ["Мужской", "m"],
              ["Женский", "f"],
            ]}
          />
        </StepCard>
      )}

      {step === 2 && (
        <StepCard
          tag="Шаг 2 · Здоровье"
          title="Хронические состояния и вес"
          lead="Диабет 2 типа и повышенное давление увеличивают риск болезни печени. Рост и вес нужны, чтобы посчитать индекс массы тела."
          error={error}
          footer={<NavButtons onBack={() => goTo(step - 1)} onNext={next} />}
        >
          <Question>У вас есть сахарный диабет 2 типа?</Question>
          <RadioGroup
            name="dm"
            value={dm}
            onChange={setDm}
            options={[
              ["Да", "1"],
              ["Нет", "0"],
            ]}
          />
          <Question>У вас есть повышенное артериальное давление?</Question>
          <RadioGroup
            name="bp"
            value={bp}
            onChange={setBp}
            options={[
              ["Да", "1"],
              ["Нет", "0"],
            ]}
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-hub-heading">Рост, см</label>
              <input
                className={inputClass}
                type="number"
                min={80}
                max={230}
                placeholder="170"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-hub-heading">Вес, кг</label>
              <input
                className={inputClass}
                type="number"
                min={20}
                max={300}
                placeholder="82"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          </div>
        </StepCard>
      )}

      {step === 3 && (
        <StepCard
          tag="Шаг 3 · Алкоголь"
          title="Сколько вы пьёте"
          lead="Укажите, сколько порций каждого напитка вы выпиваете за обычную неделю. Если не пьёте — оставьте нули."
          error={error}
          footer={<NavButtons onBack={() => goTo(step - 1)} onNext={next} />}
        >
          <Question>Как часто вы употребляете алкоголь?</Question>
          <RadioGroup
            name="afreq"
            value={afreq}
            onChange={setAfreq}
            options={[
              ["Никогда", "0"],
              ["Раз в месяц или реже", "1"],
              ["2–4 раза в месяц", "2"],
              ["2–3 раза в неделю", "3"],
              ["4 и более раз в неделю", "4"],
            ]}
          />
          <Question>Бывают ли у вас 3 дня подряд совсем без алкоголя каждую неделю?</Question>
          <RadioGroup
            name="adry"
            value={adry}
            onChange={setAdry}
            options={[
              ["Да", "1"],
              ["Нет", "0"],
            ]}
          />
          <Question>Напитки за типичную неделю</Question>
          <div className="divide-y divide-(--odos-hub-divider)">
            {DRINKS.map((d, i) => (
              <div key={d[0]} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 text-sm text-hub-body">{d[0]}</span>
                <input
                  type="number"
                  min={0}
                  className="w-20 rounded-lg border border-(--odos-input-border) px-2 py-2 text-center text-sm focus:border-hub-cta focus:outline-none focus:ring-2 focus:ring-hub-cta/20"
                  value={drinkCounts[i]}
                  onChange={(e) => {
                    const v = +e.target.value || 0;
                    setDrinkCounts((prev) => {
                      const next = [...prev];
                      next[i] = v;
                      return next;
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </StepCard>
      )}

      {step === 4 && (
        <StepCard
          tag="Шаг 4 · Питание и движение"
          title="Образ жизни"
          lead="Питание и малоподвижность — главные причины «жировой печени» (обменная болезнь печени, ранее НАЖБП)."
          error={error}
          footer={<NavButtons onBack={() => goTo(step - 1)} onNext={next} />}
        >
          {DIET.map(([q, k]) => (
            <div key={k}>
              <Question>{q}</Question>
              <RadioGroup
                name={k}
                value={dietAns[k] ?? null}
                onChange={(v) => setDiet(k, v)}
                options={[
                  ["Да", "1"],
                  ["Нет", "0"],
                ]}
              />
            </div>
          ))}
          <Question>Сколько часов вы двигаетесь/занимаетесь спортом в неделю?</Question>
          <RadioGroup
            name="dex"
            value={dietAns.dex ?? null}
            onChange={(v) => setDiet("dex", v)}
            options={[
              ["Совсем не занимаюсь", "2"],
              ["До 2,5 часов", "1"],
              ["2,5 часа и больше", "0"],
            ]}
          />
        </StepCard>
      )}

      {step === 5 && (
        <StepCard
          tag="Шаг 5 · История (вирусный гепатит)"
          title="Риск вирусного гепатита"
          lead="Вирусный гепатит — инфекция, поражающая печень. Он чаще встречается в некоторых странах и ситуациях. Ответьте честно — всё анонимно."
          error={error}
          footer={
            <NavButtons onBack={() => goTo(step - 1)} onNext={finish} nextLabel="Показать результат" />
          }
        >
          {HEP.map(([q, k]) => (
            <div key={k}>
              <Question>{q}</Question>
              <RadioGroup
                name={k}
                value={hepAns[k] ?? null}
                onChange={(v) => setHep(k, v)}
                options={[
                  ["Да", "1"],
                  ["Нет", "0"],
                  ["Не знаю", "u"],
                ]}
              />
            </div>
          ))}
        </StepCard>
      )}

      {step === 6 && result && (
        <div className="space-y-4">
          <Card
            className="border-2 text-center"
            style={{ background: overall.bg, borderColor: overall.c }}
          >
            <div className="text-5xl">{overall.em}</div>
            <Badge variant={overall.badge} className="mt-3">
              {overall.t}
            </Badge>
            <p className="mx-auto mt-3 max-w-md text-sm text-hub-body">{overall.p}</p>
          </Card>

          {[
            { name: "🍷 Алкоголь", ...result.al },
            { name: "⚖️ Обмен веществ и жировая печень", ...result.me },
            { name: "🦠 Вирусный гепатит", ...result.he },
          ].map((m) => (
            <Card key={m.name}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-hub-heading">{m.name}</span>
                <Badge variant={riskVariant(m.lvl)}>риск {m.pill}</Badge>
              </div>
              <p className="mt-2 text-sm text-hub-muted">{m.exp}</p>
            </Card>
          ))}

          <Card>
            <h3 className="text-sm font-semibold text-hub-heading">Что делать дальше</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-hub-body">
              {nextSteps.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </Card>

          <p className="text-center text-xs leading-relaxed text-hub-muted">
            Это ориентировочная оценка риска, а не диагноз. Скринер построен по модели «Love Your Liver»
            (British Liver Trust). При любом повышенном риске обратитесь к врачу — печень можно защитить,
            если действовать вовремя.
          </p>

          <Button type="button" size="lg" className="w-full" onClick={saveResult}>
            Сохранить результат для врача
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={reset}>
            ← Пройти заново
          </Button>
        </div>
      )}

    
    </>
  );
}
