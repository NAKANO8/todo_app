import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import rateLimit from "@fastify/rate-limit";
import bcrypt from "bcrypt";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../../session/redisSessionStore";
import { SessionRepository } from "../../repositories/session.repository";
import { initSessionRepository } from "../../repositories/sessionRepositoryInstance";

// タスク3.2: PATCH /profile/password の統合テスト。AuthRepositoryはモックするが
// (profile.name.api.test.ts と同方針)、ProfileService・SessionService・
// SessionRepositoryは実物を使う。理由: このタスクのcritical designポイントは
// 「ProfileService.changePasswordが呼び出し元本人のセッションを含む全セッションの
// Redisデータ・索引を破棄した後、controllerが自分自身のセッションだけをtrackSessionで
// 再追跡し、以降のリクエストで引き続き認証済みとして扱われる」ことであり、これは
// 実際のSessionRepository(RedisMock裏付け)を使わないと観測できない
// (design.md "ProfileController" Implementation Notes参照)。
//
// Requirement 5.1, 5.2, 5.3, 6.1, 6.2, 7.1, 8.1, 9.1, 9.2 を検証する。

vi.mock("../../repositories/auth.repository", () => ({
  AuthRepository: {
    findPasswordHashById: vi.fn(),
    updatePasswordHash: vi.fn(),
  },
}));

import { AuthRepository } from "../../repositories/auth.repository";
import { profileRoutes } from "../profile.route";

const CURRENT_PASSWORD = "CorrectPassword1";
// コストを下げて(4)テストの実行時間を抑える。実装側(ProfileService)が新パスワードを
// ハッシュ化する際のコスト(10)には影響しない。
const CURRENT_PASSWORD_HASH = bcrypt.hashSync(CURRENT_PASSWORD, 4);
const NEW_PASSWORD = "NewPassword1";

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
  // /profile/password には専用のレート制限(config.rateLimit)が設定されているため、
  // それを実際に有効化するためプラグイン自体を登録する(admin.session.api.test.ts等の
  // 既存テストは未登録だったが、このテストはレート制限の実効性そのものを検証する)。
  await app.register(rateLimit, { global: false });

  // テスト専用のログイン代替ルート: 指定したuserIdでセッションを張るだけ
  app.get<{ Querystring: { userId: string } }>("/test/login", async (req, reply) => {
    req.session.userId = Number(req.query.userId);
    await req.session.save();
    await repository.trackSession(Number(req.query.userId), req.session.sessionId);
    reply.send({ ok: true });
  });
  // 呼び出し元自身のセッションが変更後も引き続き有効かどうかを確認するための
  // 最小限の確認用ルート(admin.session.api.test.ts と同じ"one step further"パターン)
  app.get("/test/whoami", async (req, reply) => {
    if (!req.session.userId) return reply.status(401).send({ message: "Unauthorized" });
    return reply.send({ userId: req.session.userId });
  });

  await app.register(profileRoutes);
  return { app, repository };
}

function cookieHeader(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function loginAs(app: FastifyInstance, userId: number): Promise<string> {
  const res = await app.inject({ method: "GET", url: `/test/login?userId=${userId}` });
  return cookieHeader(res);
}

describe("profile.route PATCH /profile/password", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await new RedisMock().flushall();
    (AuthRepository.findPasswordHashById as any).mockImplementation(
      async (userId: number) => (userId === 999 ? null : CURRENT_PASSWORD_HASH)
    );
    (AuthRepository.updatePasswordHash as any).mockResolvedValue(1);
  });

  // Requirement 9.1, 9.2
  it("未認証の場合は401を返し、AuthRepository.findPasswordHashByIdは呼ばれない", async () => {
    const { app } = await buildTestApp(new RedisMock());
    const res = await app.inject({
      method: "PATCH",
      url: "/profile/password",
      payload: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(res.statusCode).toBe(401);
    expect(AuthRepository.findPasswordHashById).not.toHaveBeenCalled();
    await app.close();
  });

  // Requirement 5.3: 新規登録時と同じ強度要件をnewPasswordに適用し、満たさなければ拒否する
  it.each([
    { label: "8文字未満", newPassword: "Ab1" },
    { label: "大文字なし", newPassword: "lowercase1" },
    { label: "数字なし", newPassword: "NoDigitHere" },
    { label: "129文字", newPassword: `A1${"a".repeat(127)}` },
  ])("newPasswordが強度要件を満たさない($label)場合は400を返し、更新されない", async ({ newPassword }) => {
    const { app } = await buildTestApp(new RedisMock());
    const authedCookie = await loginAs(app, 1);
    const res = await app.inject({
      method: "PATCH",
      url: "/profile/password",
      headers: { cookie: authedCookie },
      payload: { currentPassword: CURRENT_PASSWORD, newPassword },
    });
    expect(res.statusCode).toBe(400);
    expect(AuthRepository.findPasswordHashById).not.toHaveBeenCalled();
    expect(AuthRepository.updatePasswordHash).not.toHaveBeenCalled();
    await app.close();
  });

  // Requirement 5.2: 現在のパスワードが一致しない場合は拒否し、更新もセッション無効化も行われない
  it("現在のパスワードが一致しない場合は401を返し、更新も他セッションの無効化も行われない", async () => {
    const redisClient = new RedisMock();
    const { app, repository } = await buildTestApp(redisClient);
    const authedCookie = await loginAs(app, 1);
    // 同一ユーザーの別セッションも用意しておき、影響を受けないことを確認する
    await app.inject({ method: "GET", url: "/test/login?userId=1" });
    expect(await repository.listSessionIds(1)).toHaveLength(2);

    const res = await app.inject({
      method: "PATCH",
      url: "/profile/password",
      headers: { cookie: authedCookie },
      payload: { currentPassword: "WrongPassword1", newPassword: NEW_PASSWORD },
    });

    expect(res.statusCode).toBe(401);
    expect(AuthRepository.updatePasswordHash).not.toHaveBeenCalled();
    expect(await repository.listSessionIds(1)).toHaveLength(2);
    await app.close();
  });

  it("存在しないuserIdの場合は404を返す(防御的、通常到達しない)", async () => {
    const { app } = await buildTestApp(new RedisMock());
    const authedCookie = await loginAs(app, 999);
    const res = await app.inject({
      method: "PATCH",
      url: "/profile/password",
      headers: { cookie: authedCookie },
      payload: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // Requirement 5.1, 6.1, 6.2: 成功時は本人パスワードを更新し、invalidatedCountを返し、
  // 変更操作を行った本人のセッションだけが継続して有効になる(Observable基準そのもの)
  it("現在のパスワードが正しい場合、パスワードを更新し他セッションを無効化しつつ本人のセッションは維持する", async () => {
    const redisClient = new RedisMock();
    const { app, repository } = await buildTestApp(redisClient);

    // 本人が今回操作するセッション
    const ownCookie = await loginAs(app, 1);
    // 同一ユーザーの別のログイン済みセッション(乗っ取られた想定の別セッション)
    const otherLogin = await app.inject({ method: "GET", url: "/test/login?userId=1" });
    const otherCookie = cookieHeader(otherLogin);
    expect(await repository.listSessionIds(1)).toHaveLength(2);

    const res = await app.inject({
      method: "PATCH",
      url: "/profile/password",
      headers: { cookie: ownCookie },
      payload: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: "password updated", invalidatedCount: 2 });
    expect(AuthRepository.updatePasswordHash).toHaveBeenCalledWith(1, expect.any(String));
    // Requirement 6.2 / design.md "trackSessionによる再追跡": 呼び出し元本人のsessionIdだけが
    // 無効化後も索引に残っている(将来の管理者による強制無効化に引き続き追跡される)
    expect(await repository.listSessionIds(1)).toEqual([
      expect.stringMatching(/.+/),
    ]);

    // one-step-further: 本人は引き続き操作できる
    const ownWhoami = await app.inject({
      method: "GET",
      url: "/test/whoami",
      headers: { cookie: ownCookie },
    });
    expect(ownWhoami.statusCode).toBe(200);
    expect(ownWhoami.json()).toEqual({ userId: 1 });

    // one-step-further: 同じユーザーの別セッションは未認証として扱われる
    const otherWhoami = await app.inject({
      method: "GET",
      url: "/test/whoami",
      headers: { cookie: otherCookie },
    });
    expect(otherWhoami.statusCode).toBe(401);

    await app.close();
  });

  // Requirement 7.1: 対象は常にセッションのuserIdであり、bodyに含めても構造的に無視される
  it("リクエストボディにuserIdを含めても無視され、セッションのuserIdだけが対象になる", async () => {
    const { app } = await buildTestApp(new RedisMock());
    const authedCookie = await loginAs(app, 1);
    const res = await app.inject({
      method: "PATCH",
      url: "/profile/password",
      headers: { cookie: authedCookie },
      payload: {
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
        userId: 999,
      } as any,
    });
    expect(res.statusCode).toBe(200);
    expect(AuthRepository.findPasswordHashById).toHaveBeenCalledWith(1);
    await app.close();
  });

  // Requirement 8.1: ログインと同水準(15分10回)の専用レート制限が適用されている
  it("同一要求者からの短時間の大量試行はログインと同水準のレート制限で拒否される(11回目は429)", async () => {
    const { app } = await buildTestApp(new RedisMock());
    const authedCookie = await loginAs(app, 1);

    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({
        method: "PATCH",
        url: "/profile/password",
        headers: { cookie: authedCookie },
        // 意図的に不一致のcurrentPasswordを使い、成功パス(セッション無効化)による
        // 副作用を避けつつレート制限のカウントだけを消費する
        payload: { currentPassword: "WrongPassword1", newPassword: NEW_PASSWORD },
      });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);
    await app.close();
  }, 15000);
});
