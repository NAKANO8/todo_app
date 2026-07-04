import { NextRequest, NextResponse } from "next/server";

const FASTIFY_API = process.env.API_INTERNAL_BASE ?? "http://localhost:3001";

const PUBLIC_PATHS = ["/login", "/register", "/api/auth"];

// 管理者によるセッション強制無効化(session-invalidationスペック)が反映されるまでの遅延を
// 数秒程度に抑えるため、既定の30秒から短縮している。
const AUTH_CACHE_TTL_MS = 3_000;
const authCache = new Map<string, { ok: boolean; expires: number }>();

function extractSessionId(cookieHeader: string): string | null {
  const match = cookieHeader.match(/sessionId=([^;]+)/);
  return match ? match[1] : null;
}

async function resolveAuth(cookieHeader: string, sessionId: string | null): Promise<boolean> {
  if (!sessionId) return false;

  const cached = authCache.get(sessionId);
  if (cached && cached.expires > Date.now()) return cached.ok;

  let ok = false;
  try {
    const res = await fetch(`${FASTIFY_API}/auth/me`, {
      headers: { Cookie: cookieHeader },
    });
    ok = res.ok;
  } catch {
    ok = false;
  }

  if (authCache.size > 500) authCache.clear();
  authCache.set(sessionId, { ok, expires: Date.now() + AUTH_CACHE_TTL_MS });
  return ok;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionId = extractSessionId(cookieHeader);

  // Landing page: public, but redirect authenticated users straight to the app
  if (pathname === "/") {
    const authenticated = await resolveAuth(cookieHeader, sessionId);
    if (authenticated) {
      const url = request.nextUrl.clone();
      url.pathname = "/todos";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const authenticated = await resolveAuth(cookieHeader, sessionId);
  if (!authenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
