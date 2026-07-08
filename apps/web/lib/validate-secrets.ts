const DEFAULT_AUTH_SECRET = "dev-auth-secret-change-me";

export function validateAuthSecret(): void {
  if (process.env.APP_ENV !== "production") {
    return;
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === DEFAULT_AUTH_SECRET || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to a strong unique value (min 32 chars) when APP_ENV=production",
    );
  }
}
