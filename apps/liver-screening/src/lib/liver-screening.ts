export type RiskLevel = 0 | 1 | 2;

export type ModuleResult = {
  lvl: RiskLevel;
  pill: string;
  col: string;
  exp: string;
};

export type ScreeningAnswers = {
  age: string | null;
  sex: string | null;
  dm: string | null;
  bp: string | null;
  afreq: string | null;
  adry: string | null;
  height: number;
  weight: number;
  drinkCounts: number[];
  dietAns: Record<string, string>;
  hepAns: Record<string, string>;
};

export const DRINKS: [string, number][] = [
  ["Пинта пива/сидра (4%)", 2.3],
  ["Пинта крепкого пива (5%)", 2.8],
  ["Бокал вина 175 мл", 2.3],
  ["Бокал вина 250 мл", 3.3],
  ["Бутылка вина", 9.75],
  ["Бокал просекко/шампанского 125 мл", 1.5],
  ["Рюмка крепкого 40 мл", 1.6],
  ["Бутылка крепкого 0,5 л (40%)", 20],
  ["Бокал креплёного вина/ликёра 50 мл", 1.0],
];

export const DIET: [string, string][] = [
  ["Едите фастфуд или готовую еду 4+ раза в неделю?", "d0"],
  ["Регулярно перекусываете чипсами, шоколадом, печеньем, тортами?", "d1"],
  ["Регулярно пьёте сладкие напитки (кола, лимонад, энергетики, соки-нектары)?", "d2"],
  ["Едите сосиски, пироги, пиццу, бургеры, картофель фри 4+ раза в неделю?", "d3"],
];

export const HEP: [string, string][] = [
  [
    "Вам переливали кровь до 1991 года или препараты крови до 1986 года — в вашей стране или за рубежом?",
    "h0",
  ],
  [
    "Проходили ли вы медицинские, стоматологические операции или процедуры в странах с высокой распространённостью гепатита (Африка, Азия, Кавказ, Ближний Восток, Латинская Америка)?",
    "h1",
  ],
  ["Родились ли вы или ваши родители в таких странах/регионах?", "h2"],
  ["Вам когда-нибудь ставили диагноз вирусного гепатита?", "h3"],
  [
    "Делали ли вы пирсинг/тату в непроверенных местах или пользовались общими предметами для употребления наркотиков (иглы, трубочки, купюры и т.п.)?",
    "h4",
  ],
  ["Были ли у вас переливания крови или трансплантация органов до 1992 года?", "h5"],
  ["Есть ли у близких родственников гепатит B или C?", "h6"],
  ["Делали ли вы татуировки или пирсинг нестерильным инструментом?", "h7"],
  ["Употребляли ли вы инъекционные наркотики (даже однократно)?", "h8"],
];

export const COLORS = {
  green: "#28c76f",
  amber: "#d97706",
  red: "#ea5455",
  greenBg: "#e8f9ee",
  amberBg: "#fef3c7",
  redBg: "#fdeaea",
} as const;

export function assess(answers: ScreeningAnswers) {
  const { age, sex, dm, bp, afreq, adry, height, weight, drinkCounts, dietAns, hepAns } = answers;

  let units = 0;
  DRINKS.forEach((d, i) => {
    units += (drinkCounts[i] || 0) * d[1];
  });
  if (afreq === "0") units = 0;

  let al: ModuleResult;
  if (units <= 14) {
    al = {
      lvl: 0,
      pill: "низкий",
      col: COLORS.green,
      exp: "Употребление алкоголя в пределах низкого риска (до 14 порций-единиц в неделю).",
    };
  } else if (units <= 30) {
    al = {
      lvl: 1,
      pill: "повышенный",
      col: COLORS.amber,
      exp: `Около ${Math.round(units)} единиц в неделю — выше безопасного уровня. Стоит сократить.`,
    };
  } else {
    al = {
      lvl: 2,
      pill: "высокий",
      col: COLORS.red,
      exp: `Около ${Math.round(units)} единиц в неделю — это большой риск для печени. Важно снизить и обсудить с врачом.`,
    };
  }
  if (adry === "0" && units > 14 && al.lvl < 2) {
    al = { ...al, exp: `${al.exp} Полезно делать 3 дня в неделю совсем без алкоголя.` };
  }

  const h = height / 100;
  const w = weight;
  const bmi = w / (h * h);
  const dmYes = dm === "1";
  const bpYes = bp === "1";
  const dietYes = ["d0", "d1", "d2", "d3"].filter((k) => dietAns[k] === "1").length;
  const exBad = dietAns.dex === "2";
  const exMid = dietAns.dex === "1";
  const dietBad = dietYes >= 2 || exBad || (dietYes >= 1 && exMid);
  const bmiBand = bmi >= 30 ? 2 : bmi >= 25 ? 1 : 0;

  let me: ModuleResult;
  if (bmiBand === 2) {
    me = { lvl: 2, pill: "высокий", col: COLORS.red, exp: "" };
  } else if (bmiBand === 1) {
    me =
      dmYes || bpYes || dietBad
        ? { lvl: 2, pill: "высокий", col: COLORS.red, exp: "" }
        : { lvl: 1, pill: "повышенный", col: COLORS.amber, exp: "" };
  } else {
    me =
      dietBad || dmYes || bpYes
        ? { lvl: 1, pill: "повышенный", col: COLORS.amber, exp: "" }
        : { lvl: 0, pill: "низкий", col: COLORS.green, exp: "" };
  }
  me = {
    ...me,
    exp:
      me.lvl === 0
        ? "Вес и образ жизни в зоне низкого риска жировой печени."
        : me.lvl === 1
          ? `ИМТ ${bmi.toFixed(1)} и образ жизни повышают риск жировой печени. Питание и движение помогают его снизить.`
          : `ИМТ ${bmi.toFixed(1)}${dmYes || bpYes ? ", плюс хронические состояния," : ""} — высокий риск жировой печени. Стоит обсудить проверку с врачом.`,
  };

  const viralHepRisk = ["h5", "h6", "h7", "h8"].some((k) => hepAns[k] === "1");
  let he: ModuleResult;
  if (hepAns.h3 === "1") {
    he = {
      lvl: 2,
      pill: "высокий",
      col: COLORS.red,
      exp: "У вас был диагноз гепатита — важно наблюдаться у врача и уточнить состояние печени.",
    };
  } else {
    const risks = ["h0", "h1", "h2", "h4"].filter((k) => hepAns[k] === "1").length;
    he =
      risks > 0 || viralHepRisk
        ? {
            lvl: 1,
            pill: "повышенный",
            col: COLORS.amber,
            exp: "Есть факторы риска вирусного гепатита. Стоит сдать анализ на гепатиты B и C — это простой бесплатный тест.",
          }
        : {
            lvl: 0,
            pill: "низкий",
            col: COLORS.green,
            exp: "Явных факторов риска вирусного гепатита не отмечено.",
          };
  }
  if (viralHepRisk) {
    const lvl = Math.max(he.lvl, 1) as RiskLevel;
    he = {
      ...he,
      lvl,
      pill: lvl === 1 ? "повышенный" : he.pill,
      col: lvl === 1 ? COLORS.amber : he.col,
      exp: `${he.exp} Рекомендован лабораторный скрининг: HBsAg + Anti-HCV.`,
    };
  }

  return {
    al,
    me,
    he,
    viralHepRisk,
    units: Math.round(units),
    bmi: bmi.toFixed(1),
    store: { age, sex, dm, bp },
  };
}

export function buildSaveText(
  result: ReturnType<typeof assess>,
  overallTitle: string,
): string {
  const d = result.store;
  const date = new Date().toLocaleDateString("ru-RU");
  return `Проверка риска болезни печени (скринер «Love Your Liver»)
Дата: ${date}

Возраст: ${d.age} | пол: ${d.sex === "f" ? "жен" : "муж"} | ИМТ: ${result.bmi}
Диабет 2 типа: ${d.dm === "1" ? "да" : "нет"} | повышенное давление: ${d.bp === "1" ? "да" : "нет"}
Алкоголь: ~${result.units} единиц в неделю

Оценка риска:
  Алкоголь: ${result.al.pill}
  Обмен/жировая печень: ${result.me.pill}
  Вирусный гепатит: ${result.he.pill}

Общий итог: ${overallTitle}`;
}
