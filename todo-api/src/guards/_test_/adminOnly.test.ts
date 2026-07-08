import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../../session/redisSessionStore";
import { SessionRepository } from "../../repositories/session.repository";
import { initSessionRepository } from "../../repositories/sessionRepositoryInstance";

// タスク2.2: adminOnlyGuard を単体で検証する（AuthRepositoryはモック）。
//
// admin.session.route.ts / admin.session.api.test.ts とは独立に、
// guards/adminOnly.ts が公開する adminOnlyGuard 単体の判定(401/403/通過)を、
// このガードだけを preHandler として登録した最小のFastifyインスタンスで確認する。
// admin.user.route.ts (タスク3で追加予定) からも同じ関数が使われる前提の
// 回帰基盤になる。

const usersById: Record<number, { id: number; email: string; role: string }> = {
  1: { id: 1, email: "admin@example.com", role: "admin" },
  2: { id: 2, email: "member@example.com", role: "member" },
};

vi.mock("../../repositories/auth.repository", () => ({
  AuthRepository: {
    findById: vi.fn(async (id: number) => usersById[id] ?? null),
  },
}));

import { adminOnlyGuard } from "../adminOnly";
import { AuthRepository } from "../../repositories/auth.repository";

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
    reply.send({ ok: true });
  });

  // adminOnlyGuard 単体だけを preHandler に登録した検証用ルート。ガードを
  // 通過した場合にのみ 200 を返すので、「何も送信せずhookが継続した」ことを
  // このハンドラの実行有無で観測できる。
  app.get("/guarded", { preHandler: adminOnlyGuard }, async (_req, reply) => {
    reply.send({ ok: true });
  });

  return app;
}

function cookieHeader(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

describe("adminOnlyGuard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await new RedisMock().flushall();
  });

  it("未認証(req.session.userIdなし)の場合は401かつ{message: 'Unauthorized'}を返し、後続ハンドラを呼ばない", async () => {
    const app = await buildTestApp(new RedisMock());

    const res = await app.inject({ method: "GET", url: "/guarded" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ message: "Unauthorized" });
    expect(AuthRepository.findById).not.toHaveBeenCalled();

    await app.close();
  });

  it("認証済みだがrole!=='admin'の場合は403かつ{message: 'Forbidden'}を返し、後続ハンドラを呼ばない", async () => {
    const redisClient = new RedisMock();
    const app = await buildTestApp(redisClient);

    const login = await app.inject({ method: "GET", url: "/test/login?userId=2" });
    const res = await app.inject({
      method: "GET",
      url: "/guarded",
      headers: { cookie: cookieHeader(login) },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ message: "Forbidden" });
    expect(AuthRepository.findById).toHaveBeenCalledWith(2);

    await app.close();
  });

  it("認証済みでrole==='admin'の場合は何も送信せず通過し、後続ハンドラが実行される", async () => {
    const redisClient = new RedisMock();
    const app = await buildTestApp(redisClient);

    const login = await app.inject({ method: "GET", url: "/test/login?userId=1" });
    const res = await app.inject({
      method: "GET",
      url: "/guarded",
      headers: { cookie: cookieHeader(login) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(AuthRepository.findById).toHaveBeenCalledWith(1);

    await app.close();
  });

  it("認証済みだが対象ユーザーがAuthRepositoryに見つからない場合も403を返す", async () => {
    const redisClient = new RedisMock();
    const app = await buildTestApp(redisClient);

    const login = await app.inject({ method: "GET", url: "/test/login?userId=999" });
    const res = await app.inject({
      method: "GET",
      url: "/guarded",
      headers: { cookie: cookieHeader(login) },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ message: "Forbidden" });

    await app.close();
  });
});
