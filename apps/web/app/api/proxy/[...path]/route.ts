import { NextRequest, NextResponse } from "next/server";

import { resolveAccessToken, type SessionCookieUpdate } from "@/lib/server-access-token";
import { isProxyPathAllowed, normalizeProxySegments } from "@/lib/proxy-allowlist";
import { SESSION_MAX_AGE_SEC } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

const target = process.env.API_PROXY_TARGET ?? process.env.API_URL ?? "http://localhost:8088";

const SENSITIVE_FILE_RE = /\/images\/[^/]+\/file$/;

function applySensitiveCacheHeaders(pathKey: string, headers: Headers) {
  if (SENSITIVE_FILE_RE.test(pathKey)) {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  }
}

function applySessionCookie(res: NextResponse, cookie: SessionCookieUpdate) {
  res.cookies.set(cookie.name, cookie.value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookie.secure,
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

async function proxy(req: NextRequest, segments: string[]) {
  const normalized = normalizeProxySegments(segments);
  const pathKey = normalized.join("/");
  if (!isProxyPathAllowed(segments)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { accessToken, sessionCookie } = await resolveAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiPath = `/api/v1/${pathKey}`;
  const url = `${target}${apiPath}${req.nextUrl.search}`;
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${accessToken}`);
  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.body) {
      init.body = req.body;
      init.duplex = "half";
    } else {
      init.body = await req.arrayBuffer();
    }
  }

  const res = await fetch(url, init);
  const outHeaders = new Headers(res.headers);
  applySensitiveCacheHeaders(pathKey, outHeaders);
  const out = new NextResponse(res.body, {
    status: res.status,
    headers: outHeaders,
  });
  if (sessionCookie) {
    applySessionCookie(out, sessionCookie);
  }
  return out;
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
