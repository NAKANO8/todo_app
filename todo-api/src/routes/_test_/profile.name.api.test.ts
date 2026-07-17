import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../../session/redisSessionStore";
import { SessionRepository } from "../../repositories/session.repository";
import { initSessionRepository } from "../../repositories/sessionRepositoryInstance";

// タスク3.1: PATCH /profile/name の統合テスト。AuthRepository はモックする
// (admin.user.api.test.ts と同方針)。ProfileService自体の単体テストは
// services/_test_/profile.service.test.ts で検証済みのため、ここでは
// route -> requireAuthGuard -> controller -> service の配線と、
// Requirement 2.1/2.2 (1〜50文字の範囲チェック)、Requirement 7.1 (対象は常に
// セッションのuserIdのみ)、Requirement 9.1/9.2 (未認証拒否) を確認する。

vi.mock("../../repositories/auth.repository", () => ({
  AuthRepository: { updateName: vi.fn() },
}));

import { AuthRepository } from "../../repositories/auth.repository";
import { profileRoutes } from "../profile.route";

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

  await app.register(profileRoutes);
  return { app };
}

function cookieHeader(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function loginAs(app: FastifyInstance, userId: number): Promise<string> {
  const res = await app.inject({ method: "GET", url: `/test/login?userId=${userId}` });
  return cookieHeader(res);
}

describe("profile.route PATCH /profile/name", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await new RedisMock().flushall();
    (AuthRepository.updateName as any).mockImplementation(async (userId: number) =>
      userId === 999 ? 0 : 1
    );
  });

  // Requirement 9.1, 9.2
  it("未認証の場合は401を返し、AuthRepository.updateNameは呼ばれない", async () => {
    const { app } = await buildTestApp(new RedisMock());
    const res = await app.inject({
      method: "PATCH",
      url: "/profile/name",
      payload: { name: "New Name" },
    });
    expect(res.statusCode).toBe(401);
    expect(AuthRepository.updateName).not.toHaveBeenCalled();
    await app.close();
  });

  // Requirement 2.2: 範囲外の表示名は拒否される
  it.each([
    { label: "空文字", name: "" },
    { label: "51文字", name: "a".repeat(51) },
  ])("表示名が範囲外($label)の場合は400を返し、更新されない", async ({ name }) => {
    const { app } = await buildTestApp(new RedisMock());
    const authedCookie = await loginAs(app, 1);
    const res = await app.inject({
      method: "PATCH",
      url: "/profile/name",
      headers: { cookie: authedCookie },
      payload: { name },
    });
    expect(res.statusCode).toBe(400);
    expect(AuthRepository.updateName).not.toHaveBeenCalled();
    await app.close();
  });

  // Requirement 2.1, 2.2: 範囲内(境界値含む)の表示名は成功する
  it.each([
    { label: "1文字", name: "a" },
    { label: "50文字", name: "a".repeat(50) },
  ])("表示名が範囲内($label)の場合は200を返し、要求者本人のnameが更新される", async ({ name }) => {
    const { app } = await buildTestApp(new RedisMock());
    const authedCookie = await loginAs(app, 1);
    const res = await app.inject({
      method: "PATCH",
      url: "/profile/name",
      headers: { cookie: authedCookie },
      payload: { name },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: "name updated" });
    expect(AuthRepository.updateName).toHaveBeenCalledWith(1, name);
    await app.close();
  });

  // Requirement 7.1: 対象は常にセッションのuserIdであり、bodyに含めても構造的に無視される
  it("リクエストボディにuserIdを含めても無視され、セッションのuserIdだけが対象になる", async () => {
    const { app } = await buildTestApp(new RedisMock());
    const authedCookie = await loginAs(app, 1);
    const res = await app.inject({
      method: "PATCH",
      url: "/profile/name",
      headers: { cookie: authedCookie },
      payload: { name: "New Name", userId: 999 } as any,
    });
    expect(res.statusCode).toBe(200);
    expect(AuthRepository.updateName).toHaveBeenCalledWith(1, "New Name");
    await app.close();
  });

  it("存在しないuserIdの場合は404を返す(防御的、通常到達しない)", async () => {
    const { app } = await buildTestApp(new RedisMock());
    const authedCookie = await loginAs(app, 999);
    const res = await app.inject({
      method: "PATCH",
      url: "/profile/name",
      headers: { cookie: authedCookie },
      payload: { name: "New Name" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
