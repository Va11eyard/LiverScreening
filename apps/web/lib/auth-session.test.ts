import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { isSecureCookie, resolveSessionCookie, sessionCookieName } from "./session-cookie";

function request(url: string, init?: { headers?: Record<string, string>; cookies?: Record<string, string> }) {
  const headers = new Headers(init?.headers);
  const req = new NextRequest(url, { headers });
  if (init?.cookies) {
    for (const [name, value] of Object.entries(init.cookies)) {
      req.cookies.set(name, value);
    }
  }
  return req;
}

describe("sessionCookieName", () => {
  it("uses secure prefix when requested", () => {
    expect(sessionCookieName(true)).toBe("__Secure-next-auth.session-token");
    expect(sessionCookieName(false)).toBe("next-auth.session-token");
  });

  it("supports authjs base name", () => {
    expect(sessionCookieName(true, "authjs.session-token")).toBe("__Secure-authjs.session-token");
  });
});

describe("isSecureCookie", () => {
  const prevAuthUrl = process.env.AUTH_URL;

  afterEach(() => {
    process.env.AUTH_URL = prevAuthUrl;
  });

  it("reads x-forwarded-proto", () => {
    const req = request("http://localhost/login", { headers: { "x-forwarded-proto": "https" } });
    expect(isSecureCookie(req)).toBe(true);
  });

  it("uses AUTH_URL https default", () => {
    process.env.AUTH_URL = "https://platform.cornea.kz";
    const req = request("http://localhost/login");
    expect(isSecureCookie(req)).toBe(true);
  });
});

describe("resolveSessionCookie", () => {
  it("picks cookie present on request", () => {
    const req = request("https://platform.cornea.kz/", {
      headers: { "x-forwarded-proto": "https" },
      cookies: { "__Secure-authjs.session-token": "abc" },
    });
    expect(resolveSessionCookie(req)).toEqual({
      secure: true,
      cookieName: "__Secure-authjs.session-token",
    });
  });
});

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(),
  encode: vi.fn(),
}));

vi.mock("@/lib/auth-tokens", () => ({
  isAccessTokenFresh: vi.fn(),
  refreshApiTokens: vi.fn(),
  tokenPairExpiryMs: vi.fn((n: number) => Date.now() + n * 1000),
}));

import { getToken, encode } from "next-auth/jwt";
import { isAccessTokenFresh, refreshApiTokens } from "@/lib/auth-tokens";
import { resolveAccessToken } from "./server-access-token";

describe("resolveAccessToken", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.AUTH_SECRET = "test-secret-32-chars-minimum-ok!!";
  });

  it("returns null without AUTH_SECRET", async () => {
    delete process.env.AUTH_SECRET;
    const req = request("http://localhost/");
    await expect(resolveAccessToken(req)).resolves.toEqual({ accessToken: null });
  });

  it("returns fresh access token from session jwt", async () => {
    vi.mocked(getToken).mockResolvedValue({
      accessToken: "tok",
      accessTokenExpires: Date.now() + 3600_000,
    });
    vi.mocked(isAccessTokenFresh).mockReturnValue(true);

    const req = request("https://platform.cornea.kz/", {
      headers: { "x-forwarded-proto": "https" },
      cookies: { "__Secure-next-auth.session-token": "jwt" },
    });
    await expect(resolveAccessToken(req)).resolves.toEqual({ accessToken: "tok" });
  });

  it("refreshes stale token and returns session cookie update", async () => {
    vi.mocked(getToken).mockImplementation(async ({ cookieName }) => {
      if (String(cookieName).includes("authjs")) {
        return {
          accessToken: "old",
          accessTokenExpires: Date.now() - 1000,
          refreshToken: "refresh",
        };
      }
      return null;
    });
    vi.mocked(isAccessTokenFresh).mockReturnValue(false);
    vi.mocked(refreshApiTokens).mockResolvedValue({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
    });
    vi.mocked(encode).mockResolvedValue("encoded-jwt");

    const req = request("https://platform.cornea.kz/", {
      headers: { "x-forwarded-proto": "https" },
      cookies: { "__Secure-authjs.session-token": "jwt" },
    });
    const result = await resolveAccessToken(req);
    expect(result.accessToken).toBe("new-access");
    expect(result.sessionCookie?.value).toBe("encoded-jwt");
    expect(result.sessionCookie?.name).toContain("authjs.session-token");
  });
});
