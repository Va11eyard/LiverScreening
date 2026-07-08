import type { NextRequest } from "next/server";

const COOKIE_BASES = ["next-auth.session-token", "authjs.session-token"] as const;

export function sessionCookieName(
  secure: boolean,
  base: (typeof COOKIE_BASES)[number] = "next-auth.session-token",
): string {
  const prefix = secure ? "__Secure-" : "";
  return `${prefix}${base}`;
}

export function isSecureCookie(req: NextRequest): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) {
    return proto.split(",")[0]?.trim() === "https";
  }
  if (process.env.AUTH_URL?.startsWith("https://")) {
    return true;
  }
  return req.nextUrl.protocol === "https:";
}

/** Pick the session cookie name present on the request (handles next-auth vs authjs prefixes). */
export function resolveSessionCookie(req: NextRequest): { secure: boolean; cookieName: string } {
  const secure = isSecureCookie(req);
  const prefix = secure ? "__Secure-" : "";

  for (const base of COOKIE_BASES) {
    const name = `${prefix}${base}`;
    if (req.cookies.has(name) || req.cookies.has(`${name}.0`)) {
      return { secure, cookieName: name };
    }
  }

  return { secure, cookieName: sessionCookieName(secure) };
}

export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;
