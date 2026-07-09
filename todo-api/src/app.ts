// app.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import formbody from "@fastify/formbody";
import ajvFormats from "ajv-formats";
import rateLimit from "@fastify/rate-limit";
import redis from "@fastify/redis";
import { RedisSessionStore } from "./session/redisSessionStore";
import { SessionRepository } from "./repositories/session.repository";
import { initSessionRepository } from "./repositories/sessionRepositoryInstance";
import { todoRoutes } from "./routes/todos.route";
import { authRoutes } from "./routes/auth.route";
import { adminSessionRoutes } from "./routes/admin.session.route";
import { adminUserRoutes } from "./routes/admin.user.route";

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

  // todo-api全体で共有する単一のRedis接続。ioredisベース、公式プラグイン。
  // 接続先は1.1で追加した環境変数（dev/prod/test各設定ファイル）から読み取る。
  // REDIS_PORTが未設定だとNumber(undefined)がNaNになり、ioredisが不正なポートとして
  // 同期的に例外を投げてプロセスごとクラッシュしうるため、標準ポート6379へフォールバックする。
  await app.register(redis, {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
  });

  // 既定のインメモリMemoryStoreをRedisバックエンドに切り替える。プロセス再起動やスケールアウトで
  // セッションが失われず、管理者による強制無効化(このspec)が全インスタンスに反映される。
  const redisSessionStore = new RedisSessionStore(app.redis, "sess:");
  await app.register(session, {
    secret: process.env.SESSION_SECRET!,
    store: redisSessionStore,
    cookie: {
      secure: process.env.COOKIE_SECURE === "true",
      httpOnly: true,
      sameSite: "lax",
      domain: process.env.COOKIE_DOMAIN,
    },
  });

  // userId → sessionId の逆引き索引。ログイン/自己ログアウト(auth.controller.ts)と
  // 管理者向け強制無効化(このspecの後続タスク)の双方から参照される。
  initSessionRepository(new SessionRepository(app.redis, redisSessionStore));

  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  await app.register(todoRoutes);
  await app.register(authRoutes);
  await app.register(adminSessionRoutes);
  await app.register(adminUserRoutes);
  return app;
}