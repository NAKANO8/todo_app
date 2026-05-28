import { NextRequest, NextResponse } from "next/server";

const FASTIFY_API = process.env.API_INTERNAL_BASE ?? "http://localhost:3001";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const res = await fetch(`${FASTIFY_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }).toString(),
  });

  if (!res.ok) {
    return NextResponse.redirect(new URL("/login?error=invalid_credentials", request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });

  // Fastifyのセッションクッキーをブラウザに転送する
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    response.headers.set("set-cookie", setCookie);
  }

  return response;
}
