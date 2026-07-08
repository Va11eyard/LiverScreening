import type { TokenPair } from "@/lib/api";

const REFRESH_BUFFER_MS = 60_000;

export function apiServerUrl() {
  return process.env.API_URL ?? process.env.API_PROXY_TARGET ?? "http://localhost:8088";
}

export function isAccessTokenFresh(
  accessToken: string | undefined,
  accessTokenExpires: number | undefined,
  now = Date.now(),
): boolean {
  if (!accessToken) return false;
  if (!accessTokenExpires) return true;
  return now < accessTokenExpires - REFRESH_BUFFER_MS;
}

export async function refreshApiTokens(refreshToken: string): Promise<TokenPair | null> {
  const res = await fetch(`${apiServerUrl()}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json() as Promise<TokenPair>;
}

export function tokenPairExpiryMs(expiresIn: number) {
  return Date.now() + expiresIn * 1000;
}
