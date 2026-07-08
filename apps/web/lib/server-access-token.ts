import { encode, getToken, type JWT } from "next-auth/jwt";
import type { NextRequest } from "next/server";

import {
  isAccessTokenFresh,
  refreshApiTokens,
  tokenPairExpiryMs,
} from "@/lib/auth-tokens";
import { SESSION_MAX_AGE_SEC, sessionCookieName } from "@/lib/session-cookie";

const COOKIE_BASES = ["next-auth.session-token", "authjs.session-token"] as const;

export type SessionCookieUpdate = {
  name: string;
  value: string;
  secure: boolean;
};

export type AccessTokenResult = {
  accessToken: string | null;
  sessionCookie?: SessionCookieUpdate;
};

async function readSessionJwt(
  req: NextRequest,
  secret: string,
): Promise<{ jwt: JWT; secure: boolean; cookieName: string } | null> {
  for (const base of COOKIE_BASES) {
    for (const secure of [true, false] as const) {
      const cookieName = sessionCookieName(secure, base);
      const jwt = await getToken({
        req,
        secret,
        secureCookie: secure,
        cookieName,
        salt: cookieName,
      });
      if (jwt) return { jwt, secure, cookieName };
    }
  }
  return null;
}

export async function resolveAccessToken(req: NextRequest): Promise<AccessTokenResult> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return { accessToken: null };

  const session = await readSessionJwt(req, secret);
  if (!session) return { accessToken: null };
  const { jwt, secure, cookieName } = session;

  const accessToken = jwt.accessToken as string | undefined;
  const accessTokenExpires = jwt.accessTokenExpires as number | undefined;
  if (isAccessTokenFresh(accessToken, accessTokenExpires)) {
    return { accessToken: accessToken ?? null };
  }

  const refreshToken = jwt.refreshToken as string | undefined;
  if (!refreshToken) {
    return { accessToken: accessToken ?? null };
  }

  const tokens = await refreshApiTokens(refreshToken);
  if (!tokens) {
    return { accessToken: accessToken ?? null };
  }

  const updatedJwt: JWT = {
    ...jwt,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessTokenExpires: tokenPairExpiryMs(tokens.expires_in),
  };
  delete updatedJwt.error;

  const encoded = await encode({
    token: updatedJwt,
    secret,
    salt: cookieName,
    maxAge: SESSION_MAX_AGE_SEC,
  });

  return {
    accessToken: tokens.access_token,
    sessionCookie: {
      name: cookieName,
      value: encoded,
      secure,
    },
  };
}
