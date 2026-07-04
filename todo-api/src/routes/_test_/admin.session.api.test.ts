import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../../session/redisSessionStore";
import { SessionRepository } from "../../repositories/session.repository";
import { initSessionRepository } from "../../repositories/sessionRepositoryInstance";

// タスク6.1・6.2: 管理者専用APIエンドポイント（アクセス制御 + エンドポイント）
//
// AuthRepository（MySQLに依存）はモックする。app.tsへの登録（アプリ全体への組み込み）は
// タスク8.1の範囲なので、ここでは`adminSessionRoutes`単体を独立したFastifyインスタンスに
// 登録して検証する。

const usersById: Record<number, { id: number; email: string; role: string }> = {
  1: { id: 1, email: "admin@example.com", role: "admin" },
  2: { id: 2, email: "member@example.com", role: "member" },
};

vi.mock("../../repositories/auth.repository", () => ({
  AuthRepository: {
    findById: vi.fn(async (id: number) => usersById[id] ?? null),
  },
}));

import { adminSessionRoutes } from "../admin.session.route";

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
  // テスト専用のログイン代替ルート: 指定したuserIdでセッションを張るだけ
  app.get<{ Querystring: { userId: string } }>("/test/login", async (req, reply) => {
    req.session.userId = Number(req.query.userId);
    await req.session.save();
    await repository.trackSession(Number(req.query.userId), req.session.sessionId);
    reply.send({ ok: true });
  });
  // 自己ターゲット無効化後、この呼び出し自身のCookieが本当に無効化されたかを
  // 検証するための最小限の確認用ルート
  app.get("/test/whoami", async (req, reply) => {
    if (!req.session.userId) return reply.status(401).send({ message: "Unauthorized" });
    return reply.send({ userId: req.session.userId });
  });
  await app.register(adminSessionRoutes);
  return { app, repository };
}

function cookieHeader(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

describe("DELETE /admin/sessions/:userId", () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  it("未認証の場合は401を返す", async () => {
    const { app } = await buildTestApp(new RedisMock());

    const res = await app.inject({ method: "DELETE", url: "/admin/sessions/2" });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("管理者以外は403を返す", async () => {
    const redisClient = new RedisMock();
    const { app } = await buildTestApp(redisClient);

    const login = await app.inject({ method: "GET", url: "/test/login?userId=2" });
    const res = await app.inject({
      method: "DELETE",
      url: "/admin/sessions/1",
      headers: { cookie: cookieHeader(login) },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("管理者権限なら対象ユーザーのセッションを無効化し、件数を返す", async () => {
    const redisClient = new RedisMock();
    const { app, repository } = await buildTestApp(redisClient);

    // 管理者(userId=1)でログイン
    const adminLogin = await app.inject({ method: "GET", url: "/test/login?userId=1" });
    // 対象ユーザー(userId=2)のセッションを2つ作る
    await app.inject({ method: "GET", url: "/test/login?userId=2" });
    await app.inject({ method: "GET", url: "/test/login?userId=2" });
    expect(await repository.listSessionIds(2)).toHaveLength(2);

    const res = await app.inject({
      method: "DELETE",
      url: "/admin/sessions/2",
      headers: { cookie: cookieHeader(adminLogin) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ invalidatedCount: 2 });
    expect(await repository.listSessionIds(2)).toEqual([]);

    await app.close();
  });

  it("管理者が自分自身を対象にしても同じ挙動になる", async () => {
    const redisClient = new RedisMock();
    const { app, repository } = await buildTestApp(redisClient);

    const adminLogin = await app.inject({ method: "GET", url: "/test/login?userId=1" });

    const res = await app.inject({
      method: "DELETE",
      url: "/admin/sessions/1",
      headers: { cookie: cookieHeader(adminLogin) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ invalidatedCount: 1 });
    expect(await repository.listSessionIds(1)).toEqual([]);

    // 回帰確認: 自己ターゲット無効化の直後、同じCookieで別のリクエストを送ると
    // 未認証として扱われる(=@fastify/sessionのonSendフックによる自動再保存で
    // 復活していない)ことを確認する
    const whoamiRes = await app.inject({
      method: "GET",
      url: "/test/whoami",
      headers: { cookie: cookieHeader(adminLogin) },
    });
    expect(whoamiRes.statusCode).toBe(401);

    await app.close();
  });
});
