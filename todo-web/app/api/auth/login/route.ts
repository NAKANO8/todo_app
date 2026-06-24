import { type NextRequest } from "next/server";
import http from "node:http";

const FASTIFY_API = process.env.API_INTERNAL_BASE ?? "http://localhost:3001";

// Next.js patches global fetch and strips Set-Cookie from responses.
// Use node:http directly to get raw headers.
function callLoginApi(
  baseUrl: string,
  email: string,
  password: string
): Promise<{ statusCode: number; setCookies: string[] }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password });
    const url = new URL(`${baseUrl}/auth/login`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        const setCookies =
          (res.headers["set-cookie"] as string[] | undefined) ?? [];
        resolve({ statusCode: res.statusCode ?? 500, setCookies });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  let statusCode: number;
  let setCookies: string[];

  try {
    ({ statusCode, setCookies } = await callLoginApi(FASTIFY_API, email, password));
  } catch {
    return new Response(null, {
      status: 303,
      headers: { Location: "/login?error=server_error" },
    });
  }

  if (statusCode < 200 || statusCode >= 300) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/login?error=invalid_credentials" },
    });
  }

  const response = new Response(null, {
    status: 303,
    headers: { Location: "/" },
  });

  for (const cookie of setCookies) {
    response.headers.append("set-cookie", cookie);
  }

  return response;
}
