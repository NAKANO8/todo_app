import { NextRequest, NextResponse } from "next/server";

const FASTIFY_API = process.env.API_INTERNAL_BASE ?? "http://localhost:3001";

const PUBLIC_PATHS = ["/login", "/register", "/api/auth"];

// 管理者によるセッション強制無効化(session-invalidationスペック)が反映されるまでの遅延を
// 数秒程度に抑えるため、既定の30秒から短縮している。
const AUTH_CACHE_TTL_MS = 3_000;

type AuthResolution = { ok: boolean; role: string | null };
type AuthCacheEntry = AuthResolution & { expires: number };

const authCache = new Map<string, AuthCacheEntry>();

function extractSessionId(cookieHeader: string): string | null {
  const match = cookieHeader.match(/sessionId=([^;]+)/);
  return match ? match[1] : null;
}

async function resolveAuth(cookieHeader: string, sessionId: string | null): Promise<AuthResolution> {
  if (!sessionId) return { ok: false, role: null };

  const cached = authCache.get(sessionId);
  if (cached && cached.expires > Date.now()) return { ok: cached.ok, role: cached.role };

  let ok = false;
  let role: string | null = null;
  try {
    const res = await fetch(`${FASTIFY_API}/auth/me`, {
      headers: { Cookie: cookieHeader },
    });
    ok = res.ok;
    if (ok) {
      const body = await res.json();
      role = typeof body?.role === "string" ? body.role : null;
    }
  } catch {
    ok = false;
    role = null;
  }

  if (authCache.size > 500) authCache.clear();
  authCache.set(sessionId, { ok, role, expires: Date.now() + AUTH_CACHE_TTL_MS });
  return { ok, role };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionId = extractSessionId(cookieHeader);

  // Landing page: public, but redirect authenticated users straight to the app
  if (pathname === "/") {
    const { ok: authenticated } = await resolveAuth(cookieHeader, sessionId);
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

  const { ok: authenticated, role } = await resolveAuth(cookieHeader, sessionId);
  if (!authenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 管理者向け画面(/admin配下)は管理者ロールを持たないユーザーを一般ユーザー向け画面へ
  // リダイレクトする。ここでの判定はUXの補助であり、認可の権威的な判定はAPI側の
  // adminOnlyGuardが担う(design.md "Web / Feature"参照)。
  if (pathname.startsWith("/admin") && role !== "admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/todos";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
