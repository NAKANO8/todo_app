import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../../session/redisSessionStore";
import { SessionRepository } from "../../repositories/session.repository";
import { initSessionRepository } from "../../repositories/sessionRepositoryInstance";

// タスク4.1・4.2: ログイン/自己ログアウトでの逆引き索引維持
//
// AuthService（MySQLに依存）は本テストの対象外なのでモックする。AuthController自体は
// 実際のRedisSessionStore/SessionRepository（ioredis-mockバックエンド）を通して動かし、
// 「ログインで索引に追加される」「自己ログアウトでそのセッションだけ索引から消える」という
// 実際の索引の状態変化を検証する。
vi.mock("../../services/auth.service", () => ({
  AuthService: {
    login: vi.fn().mockResolvedValue({ id: 42, email: "test@example.com" }),
  },
}));

import { AuthController } from "../auth.controller";

function buildTestApp(redisClient: RedisMock, sessionRepository: SessionRepository) {
  initSessionRepository(sessionRepository);

  const app = Fastify();
  return (async () => {
    await app.register(cookie);
    await app.register(session, {
      secret: "test_session_secret_that_is_32chars!",
      store: new RedisSessionStore(redisClient as any, "sess:"),
      cookie: { secure: false },
    });
    app.post("/login", AuthController.login);
    app.post("/logout", AuthController.logout);
    return app;
  })();
}

describe("AuthController: ログイン/自己ログアウトでの索引維持", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // ioredis-mockは既定でインスタンス間のバックエンドを共有するため、テストごとに
    // 明示的にflushしないと前のテストのキーが残ってしまう。
    await new RedisMock().flushall();
  });

  it("ログイン成功時に、発行されたセッションが逆引き索引へ追加される", async () => {
    const redisClient = new RedisMock();
    const sessionStore = new RedisSessionStore(redisClient as any, "sess:");
    const sessionRepository = new SessionRepository(redisClient as any, sessionStore);
    const app = await buildTestApp(redisClient, sessionRepository);

    const res = await app.inject({
      method: "POST",
      url: "/login",
      payload: { email: "test@example.com", password: "irrelevant" },
    });

    expect(res.statusCode).toBe(200);
    const ids = await sessionRepository.listSessionIds(42);
    expect(ids).toHaveLength(1);

    await app.close();
  });

  it("自己ログアウトは、自分のセッションだけを索引から取り除き、同じユーザーの他セッションは残す", async () => {
    const redisClient = new RedisMock();
    const sessionStore = new RedisSessionStore(redisClient as any, "sess:");
    const sessionRepository = new SessionRepository(redisClient as any, sessionStore);
    const app = await buildTestApp(redisClient, sessionRepository);

    // デバイスA・デバイスB相当の2セッションを作る
    const loginA = await app.inject({
      method: "POST",
      url: "/login",
      payload: { email: "test@example.com", password: "irrelevant" },
    });
    await app.inject({
      method: "POST",
      url: "/login",
      payload: { email: "test@example.com", password: "irrelevant" },
    });

    expect(await sessionRepository.listSessionIds(42)).toHaveLength(2);

    const cookieA = loginA.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const logoutRes = await app.inject({
      method: "POST",
      url: "/logout",
      headers: { cookie: cookieA },
    });

    expect(logoutRes.statusCode).toBe(200);
    expect(await sessionRepository.listSessionIds(42)).toHaveLength(1);

    await app.close();
  });
});
