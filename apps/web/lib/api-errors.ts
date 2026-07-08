const API_ERROR_RU: Record<string, string> = {
  "at least one image required": "Добавьте хотя бы один снимок",
  "no images provided": "Добавьте хотя бы один снимок",
  "invalid file type": "Неподдерживаемый формат снимка (нужен JPG, PNG или TIFF)",
  "file too large": "Снимок больше 20 МБ",
  "too many files": "Слишком много снимков (максимум 30)",
  "request too large": "Слишком большой объём снимков. Загрузите меньше файлов за раз",
  "invalid request": "Некорректный запрос",
  "invalid body": "Некорректные данные запроса",
  "invalid multipart form": "Ошибка загрузки файлов",
  "invalid credentials": "Неверный email или пароль",
  unauthorized: "Сессия истекла. Войдите снова",
  forbidden: "Недостаточно прав",
  "not found": "Не найдено",
  "internal server error": "Внутренняя ошибка сервера",
  "too many requests": "Слишком много запросов. Подождите немного",
  "too many login attempts": "Слишком много попыток входа. Подождите немного",
  "missing token": "Сессия истекла. Войдите снова",
  "invalid token": "Сессия истекла. Войдите снова",
  "failed to read image": "Не удалось прочитать снимок для ИИ-анализа",
  "inference service unavailable": "Сервис ИИ временно недоступен",
  "failed to encode snapshot": "Ошибка сохранения результата ИИ",
  "ai client not configured": "ИИ не настроен на сервере",
};

const HTTP_STATUS_RU: Record<string, string> = {
  unauthorized: "Сессия истекла. Войдите снова",
  forbidden: "Недостаточно прав",
  "not found": "Не найдено",
  "bad request": "Некорректный запрос",
  "internal server error": "Внутренняя ошибка сервера",
  "too many requests": "Слишком много запросов",
  "request entity too large": "Слишком большой объём данных",
};

const AI_ERROR_SUBSTRINGS: [string, string][] = [
  ["ai inference status", "Сервис ИИ вернул ошибку"],
  ["ai client not configured", "ИИ не настроен на сервере"],
  ["decode ai response", "Ошибка ответа сервиса ИИ"],
];

export const GENERIC_ERROR_MESSAGE = "Произошла ошибка. Попробуйте ещё раз";

function hasCyrillic(text: string): boolean {
  return /[а-яё]/i.test(text);
}

export function mapApiErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return GENERIC_ERROR_MESSAGE;

  const key = trimmed.toLowerCase();
  if (API_ERROR_RU[key]) return API_ERROR_RU[key];
  if (HTTP_STATUS_RU[key]) return HTTP_STATUS_RU[key];

  for (const [substr, ru] of AI_ERROR_SUBSTRINGS) {
    if (key.includes(substr)) return ru;
  }

  if (hasCyrillic(trimmed)) return trimmed;

  return GENERIC_ERROR_MESSAGE;
}

export function userErrorMessage(error: unknown, fallback = GENERIC_ERROR_MESSAGE): string {
  if (error instanceof Error && error.message.trim()) {
    const mapped = mapApiErrorMessage(error.message);
    if (mapped !== GENERIC_ERROR_MESSAGE) return mapped;
    if (hasCyrillic(error.message)) return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    const mapped = mapApiErrorMessage(error);
    if (mapped !== GENERIC_ERROR_MESSAGE) return mapped;
    if (hasCyrillic(error)) return error.trim();
  }
  return fallback;
}
