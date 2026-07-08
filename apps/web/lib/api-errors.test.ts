import { describe, expect, it } from "vitest";

import { mapApiErrorMessage, userErrorMessage } from "./api-errors";

describe("mapApiErrorMessage", () => {
  it("maps known API errors to Russian", () => {
    expect(mapApiErrorMessage("at least one image required")).toBe("Добавьте хотя бы один снимок");
    expect(mapApiErrorMessage("invalid credentials")).toBe("Неверный email или пароль");
    expect(mapApiErrorMessage("Unauthorized")).toBe("Сессия истекла. Войдите снова");
  });

  it("passes through Cyrillic messages", () => {
    expect(mapApiErrorMessage("Не удалось скачать отчёт")).toBe("Не удалось скачать отчёт");
  });

  it("returns generic Russian for unknown English", () => {
    expect(mapApiErrorMessage("something went wrong")).toBe("Произошла ошибка. Попробуйте ещё раз");
  });
});

describe("userErrorMessage", () => {
  it("uses context fallback for unknown English", () => {
    expect(userErrorMessage(new Error("network error"), "Не удалось сохранить")).toBe("Не удалось сохранить");
  });

  it("prefers mapped API error over fallback", () => {
    expect(userErrorMessage(new Error("forbidden"), "Не удалось сохранить")).toBe("Недостаточно прав");
  });
});
