import { z } from "zod";

function requiredText(message: string) {
  return z.preprocess(
    (val) => (val === undefined || val === null ? "" : String(val)),
    z.string().trim().min(1, message),
  );
}

function optionalText() {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    return String(val);
  }, z.string().optional());
}

function optionalNumber() {
  return z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "number" && Number.isNaN(val)) return undefined;
    const n = typeof val === "number" ? val : Number(val);
    return Number.isNaN(n) ? undefined : n;
  }, z.number().optional());
}

const ZOD_FIELD_LABELS: Record<string, string> = {
  date: "Укажите дату",
  hospital: "Выберите больницу",
  doctor: "Укажите ФИО врача",
  motherSurname: "Укажите фамилию пациента",
  childSurname: "Укажите ИИН или ID пациента",
  stage: "Укажите стадию фиброза",
  email: "Введите email",
  password: "Введите пароль",
};

function mapZodIssueText(issue: z.ZodIssue): string {
  const path = issue.path[0];
  const fieldLabel = typeof path === "string" ? ZOD_FIELD_LABELS[path] : undefined;

  if (issue.message && hasCyrillic(issue.message)) {
    return issue.message;
  }

  const msg = issue.message.toLowerCase();
  if (msg.includes("invalid email")) return "Введите корректный email";
  if (msg.includes("at least 6")) return "Минимум 6 символов";
  if (issue.code === "too_small" || msg.includes("at least 1 character") || msg === "required") {
    return fieldLabel ?? "Заполните обязательное поле";
  }
  if (issue.message.startsWith("Invalid input")) {
    return fieldLabel ?? "Проверьте обязательные поля формы";
  }

  return fieldLabel ?? "Проверьте обязательные поля формы";
}

function hasCyrillic(text: string): boolean {
  return /[а-яё]/i.test(text);
}

export function firstZodIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Проверьте обязательные поля формы";
  return mapZodIssueText(issue);
}

export const loginSchema = z.object({
  email: z.string().email("Введите email"),
  password: z.string().min(6, "Минимум 6 символов"),
});
export const caseFormSchema = z.object({
  date: requiredText("Укажите дату"),
  hospital: requiredText("Выберите больницу"),
  doctor: requiredText("Укажите ФИО врача"),
  motherSurname: requiredText("Укажите фамилию пациента"),
  childSurname: requiredText("Укажите фамилию ребёнка"),
  ga: optionalText(),
  bw: optionalNumber(),
  pca: optionalNumber(),
  ph: optionalText(),
  notes: optionalText(),
});
export const caseSubmitSchema = caseFormSchema.extend({
  eye: optionalText(),
  visit: optionalText(),
  riskFactors: optionalText(),
  camera: optionalText(),
  imageQuality: optionalText(),
  avascColor: optionalText(),
  avascHours: optionalText(),
  avascLoc: optionalText(),
  zone: optionalText(),
  artDiam: optionalText(),
  artCourse: optionalText(),
  veins: optionalText(),
  avpDZN: optionalText(),
  ropForm: optionalText(),
  stage: requiredText("Укажите стадию"),
  plusDisease: optionalText(),
  aprop: optionalText(),
  preDiag: optionalText(),
  confidence: optionalText(),
  recommendation: optionalText(),
  doubtful: optionalText(),
});

export const surveySchema = z.object({
  date: z.string().min(1),
  hospital: z.string().min(1, "Выберите больницу"),
  scores: z.array(z.number().min(1).max(5)).length(12),
  comment: z.string().optional(),
});

export type CaseFormValues = z.infer<typeof caseFormSchema>;
export type CaseSubmitValues = z.infer<typeof caseSubmitSchema>;
export type SurveyFormValues = z.infer<typeof surveySchema>;
