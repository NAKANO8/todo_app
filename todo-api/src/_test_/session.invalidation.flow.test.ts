import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../session/redisSessionStore";
import { SessionRepository } from "../repositories/session.repository";
import { initSessionRepository } from "../repositories/sessionRepositoryInstance";

// タスク8.1・8.2: 管理者ルート登録後の結合確認
//
// 実際の`buildApp()`はMySQL(pool.query)・実Redis(host/port接続)を要求するため、
// このサンドボックス環境では動かせない。代わりに、実際のルートモジュール
// (authRoutes/adminSessionRoutes)をそのまま登録した独立Fastifyインスタンスに対し、
// AuthRepositoryだけをモックし、Redisはioredis-mockを注入して検証する。
// これにより「本番で使われるルーティング・コントローラ・ミドルウェアの配線」自体は
// 実物のまま、外部依存(MySQL・実Redis)だけを置き換えて結合確認する。

const usersById: Record<number, { id: number; email: string; role: string }> = {
  1: { id: 1, email: "admin@example.com", role: "admin" },
  2: { id: 2, email: "member@example.com", role: "member" },
};

vi.mock("../repositories/auth.repository", () => ({
  AuthRepository: {
    findById: vi.fn(async (id: number) => usersById[id] ?? null),
  },
}));

import { authRoutes } from "../routes/auth.route";
import { adminSessionRoutes } from "../routes/admin.session.route";

async function buildTestApp(redisClient: RedisMock) {
  const store = new RedisSessionStore(redisClient as any, "sess:");
  const repository = new SessionRepository(redisClient as any, store);
  initSessionRepository(repository);

  const app = Fastify();
  await app.register(cookie);
  await app.register(session, {
    secret: "test_session_secret_that_is_32chars!",
    store,
    cookie: { secure: false },
  });
  // テスト専用のログイン代替ルート: 実際のAuthService.login(MySQL経由)を経由せず、
  // 指定したuserIdでセッションを張るだけ。
  app.get<{ Querystring: { userId: string } }>("/test/login", async (req, reply) => {
    req.session.userId = Number(req.query.userId);
    await req.session.save();
    await repository.trackSession(Number(req.query.userId), req.session.sessionId);
    reply.send({ ok: true });
  });
  await app.register(authRoutes);
  await app.register(adminSessionRoutes);
  return app;
}

function cookieHeader(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

describe("セッション無効化フローの結合確認", () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  it("8.1: 管理者が対象ユーザーを無効化すると、そのユーザーの全セッションがその後未認証になる", async () => {
    const redisClient = new RedisMock();
    const app = await buildTestApp(redisClient);

    const adminLogin = await app.inject({ method: "GET", url: "/test/login?userId=1" });
    // 対象ユーザー(userId=2)がデバイスA・デバイスBの2セッションでログイン
    const deviceA = await app.inject({ method: "GET", url: "/test/login?userId=2" });
    const deviceB = await app.inject({ method: "GET", url: "/test/login?userId=2" });

    // 無効化前は両方とも認証済み
    expect(
      (await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookieHeader(deviceA) } })).statusCode
    ).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookieHeader(deviceB) } })).statusCode
    ).toBe(200);

    const invalidateRes = await app.inject({
      method: "DELETE",
      url: "/admin/sessions/2",
      headers: { cookie: cookieHeader(adminLogin) },
    });
    expect(invalidateRes.statusCode).toBe(200);
    expect(invalidateRes.json()).toEqual({ invalidatedCount: 2 });

    // 無効化後は両方とも未認証になる
    const meA = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookieHeader(deviceA) } });
    const meB = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookieHeader(deviceB) } });
    expect(meA.statusCode).toBe(401);
    expect(meB.statusCode).toBe(401);

    await app.close();
  });

  it("8.2: 自己ログアウトは、ログアウトしていない別セッションに影響しない", async () => {
    const redisClient = new RedisMock();
    const app = await buildTestApp(redisClient);

    const deviceA = await app.inject({ method: "GET", url: "/test/login?userId=2" });
    const deviceB = await app.inject({ method: "GET", url: "/test/login?userId=2" });

    const logoutRes = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: cookieHeader(deviceA) },
    });
    expect(logoutRes.statusCode).toBe(200);

    // ログアウトしたデバイスAは未認証、していないデバイスBは引き続き認証済み
    const meA = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookieHeader(deviceA) } });
    const meB = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookieHeader(deviceB) } });
    expect(meA.statusCode).toBe(401);
    expect(meB.statusCode).toBe(200);

    await app.close();
  });
});
