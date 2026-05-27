import { NextRequest, NextResponse } from "next/server";

const FASTIFY_API = process.env.API_INTERNAL_BASE ?? "http://localhost:3001";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const res = await fetch(`${FASTIFY_API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }).toString(),
  });

  if (!res.ok) {
    return NextResponse.redirect(new URL("/register?error=register_failed", request.url), { status: 303 });
  }

  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
