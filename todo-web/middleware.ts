import { NextRequest, NextResponse } from "next/server";

const FASTIFY_API = process.env.API_INTERNAL_BASE ?? "http://localhost:3001";

const PUBLIC_PATHS = ["/login", "/register", "/api/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const cookieHeader = request.headers.get("cookie") ?? "";

  let authenticated = false;
  try {
    const res = await fetch(`${FASTIFY_API}/auth/me`, {
      headers: { Cookie: cookieHeader },
    });
    authenticated = res.ok;
  } catch {
    authenticated = false;
  }

  if (!authenticated) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/login" },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
