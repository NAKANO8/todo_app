import { NextRequest } from "next/server";

const FASTIFY_API = process.env.API_INTERNAL_BASE ?? "http://localhost:3001";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const res = await fetch(`${FASTIFY_API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/register?error=register_failed" },
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: "/login" },
  });
}
