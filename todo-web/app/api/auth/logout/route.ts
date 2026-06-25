import { NextRequest, NextResponse } from "next/server";

const FASTIFY_API = process.env.API_INTERNAL_BASE ?? "http://localhost:3001";

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";

  await fetch(`${FASTIFY_API}/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookieHeader },
  });

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/" },
  });
  response.cookies.delete("sessionId");
  return response;
}
