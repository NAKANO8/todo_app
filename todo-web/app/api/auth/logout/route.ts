import { NextRequest, NextResponse } from "next/server";
import http from "node:http";

const FASTIFY_API = process.env.API_INTERNAL_BASE ?? "http://localhost:3001";

// Next.js patches global fetch and strips Set-Cookie from responses.
// Use node:http directly to get raw headers (same approach as login route).
function callLogoutApi(
  baseUrl: string,
  cookieHeader: string
): Promise<{ setCookies: string[] }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/auth/logout`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          Cookie: cookieHeader,
          "X-Forwarded-Proto": "https",
        },
      },
      (res) => {
        res.resume();
        const setCookies =
          (res.headers["set-cookie"] as string[] | undefined) ?? [];
        resolve({ setCookies });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";

  let setCookies: string[] = [];
  try {
    ({ setCookies } = await callLogoutApi(FASTIFY_API, cookieHeader));
  } catch {
    // proceed with redirect even if Fastify is unreachable
  }

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/" },
  });

  for (const cookie of setCookies) {
    response.headers.append("set-cookie", cookie);
  }

  return response;
}
