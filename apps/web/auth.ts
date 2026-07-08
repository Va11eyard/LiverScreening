import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { LoginResponse } from "@/lib/api";
import { apiBaseUrl } from "@/lib/constants";
import {
  isAccessTokenFresh,
  refreshApiTokens,
  tokenPairExpiryMs,
} from "@/lib/auth-tokens";
import { validateAuthSecret } from "@/lib/validate-secrets";

validateAuthSecret();

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      hospital?: string;
    };
  }
  interface User {
    role?: string;
    hospital?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    role?: string;
    hospital?: string;
    error?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const res = await fetch(`${apiBaseUrl()}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) return null;

        const data = (await res.json()) as LoginResponse;
        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          hospital: data.user.hospital,
          accessToken: data.tokens.access_token,
          refreshToken: data.tokens.refresh_token,
          accessTokenExpires: tokenPairExpiryMs(data.tokens.expires_in),
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const path = nextUrl.pathname;
      if (
        path.startsWith("/_next/") ||
        path === "/favicon.ico" ||
        path.startsWith("/api/auth") ||
        path.startsWith("/api/proxy")
      ) {
        return true;
      }
      const isLogin = path.startsWith("/login");
      const isPublic = isLogin || path === "/";
      if (isPublic) return true;
      return !!auth;
    },
    async jwt({ token, user }) {
      if (user) {
        const signedIn = user as {
          accessToken?: string;
          refreshToken?: string;
          accessTokenExpires?: number;
          role?: string;
          hospital?: string;
        };
        token.accessToken = signedIn.accessToken;
        token.refreshToken = signedIn.refreshToken;
        token.accessTokenExpires = signedIn.accessTokenExpires;
        token.role = signedIn.role;
        token.hospital = signedIn.hospital;
        delete token.error;
        return token;
      }

      if (
        isAccessTokenFresh(
          token.accessToken as string | undefined,
          token.accessTokenExpires as number | undefined,
        )
      ) {
        return token;
      }

      const refreshToken = token.refreshToken as string | undefined;
      if (!refreshToken) {
        return token;
      }

      const refreshed = await refreshApiTokens(refreshToken);
      if (!refreshed) {
        token.error = "RefreshAccessTokenError";
        return token;
      }

      token.accessToken = refreshed.access_token;
      token.refreshToken = refreshed.refresh_token;
      token.accessTokenExpires = tokenPairExpiryMs(refreshed.expires_in);
      delete token.error;
      return token;
    },
    async session({ session, token }) {
      if (token.error === "RefreshAccessTokenError") {
        return { ...session, expires: new Date(0).toISOString() };
      }
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as string) ?? "doctor";
        session.user.hospital = token.hospital as string | undefined;
      }
      return session;
    },
  },
});
