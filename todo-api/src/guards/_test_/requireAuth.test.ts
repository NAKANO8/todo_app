import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../../session/redisSessionStore";
import { SessionRepository } from "../../repositories/session.repository";
import { initSessionRepository } from "../../repositories/sessionRepositoryInstance";

// タスク1.2: requireAuthGuard を単体で検証する。
//
// todos.route.ts に既にインラインで実装されていた「req.session.userIdが
// なければ401」の判定を guards/requireAuth.ts へ切り出したもの。挙動
// (401ステータスコード・レスポンスボディ・後続ハンドラを呼ばないこと)は
// 一切変更していない。design.md "requireAuthGuard" のContract
// (`Promise<void | FastifyReply>`, ロール・状態判定は行わない) を検証する。
// guards/adminOnly.test.ts と同じ、このガードだけをpreHandlerとして
// 登録した最小のFastifyインスタンスで確認するパターンを踏襲する。

import { requireAuthGuard } from "../requireAuth";

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

  // requireAuthGuard 単体だけを preHandler に登録した検証用ルート。ガードを
  // 通過した場合にのみ 200 を返すので、「何も送信せずhookが継続した」ことを
  // このハンドラの実行有無で観測できる。
  app.get("/guarded", { preHandler: requireAuthGuard }, async (_req, reply) => {
    reply.send({ ok: true });
  });

  return app;
}

function cookieHeader(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

describe("requireAuthGuard", () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  it("未認証(req.session.userIdなし)の場合は401かつ{message: 'Unauthorized'}を返し、後続ハンドラを呼ばない", async () => {
    const app = await buildTestApp(new RedisMock());

    const res = await app.inject({ method: "GET", url: "/guarded" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ message: "Unauthorized" });

    await app.close();
  });

  it("認証済み(req.session.userIdあり)の場合は何も送信せず通過し、後続ハンドラが実行される", async () => {
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

    await app.close();
  });
});
