// app.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import formbody from "@fastify/formbody";
import ajvFormats from "ajv-formats";
import rateLimit from "@fastify/rate-limit";
import { todoRoutes } from "./routes/todos.route";
import { authRoutes } from "./routes/auth.route";

// https://www.cloudflare.com/ips-v4 / ips-v6 で定期的に最新化すること
const CLOUDFLARE_CIDRS = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22',
  '103.31.4.0/22',   '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22',
  '198.41.128.0/17', '162.158.0.0/15',  '104.16.0.0/13',
  '104.24.0.0/14',   '172.64.0.0/13',   '131.0.72.0/22',
  '2400:cb00::/32',  '2606:4700::/32',  '2803:f800::/32',
  '2405:b500::/32',  '2405:8100::/32',  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

// Docker の内部ネットワーク帯域 (172.16.0.0/12) を信頼することで、
// web コンテナからの X-Forwarded-Proto: https を受け付ける
const TRUSTED_PROXIES = [...CLOUDFLARE_CIDRS, '172.16.0.0/12'];

export const app = Fastify({
  logger: true,
  trustProxy: TRUSTED_PROXIES,
  ajv: {
    // ajv-formats の型定義が Fastify の Plugin 型と微妙にズレているため as any でキャスト
    plugins: [ajvFormats as any],
  },
});

declare module '@fastify/session' {
  interface FastifySessionObject {
    authenticated?: boolean;
    userId?: number;
  }
}

export async function buildApp() {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  });

  await app.register(cookie);

  await app.register(formbody);

  await app.register(session, {
    secret: process.env.SESSION_SECRET!,
    cookie: {
      secure: process.env.COOKIE_SECURE === "true",
      httpOnly: true,
      sameSite: "lax",
      domain: process.env.COOKIE_DOMAIN,
    },
  });

  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  await app.register(todoRoutes);
  await app.register(authRoutes);
  return app;
}