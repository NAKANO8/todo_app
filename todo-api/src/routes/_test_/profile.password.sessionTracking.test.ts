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

// タスク5.1: 「パスワード変更後のセッション整合性」の検証。
//
// profile.password.api.test.ts (タスク3.2) は、パスワード変更成功直後に
// - repository.listSessionIds(userId) に呼び出し元本人のsessionIdだけが残っていること
// - 本人のCookieで後続リクエストが引き続き認証済みとして扱われること
// を確認済みだが、これは「索引に本人のsessionIdが載っている」ことの確認に留まり、
// 「その索引が将来の管理者による強制無効化(SessionService.invalidateUserSessions /
// DELETE /admin/sessions/:userId)から実際に見つけられ、破棄される」ことまでは
// 検証していない(索引への再登録漏れは、まさにこの一歩先の場面でしか症状が出ない —
// 本人はログインしたままに見えるが、管理者が後から無効化しても効かない、という形の
// バグになる)。
//
// このテストは、パスワード変更で使われたprofile.routeと、管理者による強制無効化で
// 使われたadmin.session.routeを同一のFastifyインスタンス・同一の実Redis裏付け
// SessionRepositoryに登録し、次の一連の流れをエンドツーエンドで検証する:
//   1. 一般ユーザーがログインする
//   2. そのユーザーが自分のパスワードを変更する(自分自身のセッションは維持される)
//   3. 管理者が同じユーザーに対して強制セッション無効化を実行する
//   4. パスワード変更後も生き残っていたはずの本人のセッションが、この強制無効化に
//      よって実際に無効化される(=将来の強制無効化の追跡対象として正しく維持され
//      続けていたことの直接的な証拠)
//
// Requirements 6.1, 6.2 を検証する。

vi.mock("../../repositories/auth.repository", () => ({
  AuthRepository: {
    findPasswordHashById: vi.fn(),
    updatePasswordHash: vi.fn(),
    findById: vi.fn(),
  },
}));

import { AuthRepository } from "../../repositories/auth.repository";
import { profileRoutes } from "../profile.route";
import { adminSessionRoutes } from "../admin.session.route";

const MEMBER_USER_ID = 1;
const ADMIN_USER_ID = 99;

const usersById: Record<number, { id: number; email: string; role: string }> = {
  [MEMBER_USER_ID]: { id: MEMBER_USER_ID, email: "member@example.com", role: "member" },
  [ADMIN_USER_ID]: { id: ADMIN_USER_ID, email: "admin@example.com", role: "admin" },
};

const CURRENT_PASSWORD = "CorrectPassword1";
// コストを下げて(4)テストの実行時間を抑える(profile.password.api.test.tsと同方針)。
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
  // /profile/password には専用のレート制限が設定されているため、実際に有効化しておく
  // (profile.password.api.test.tsと同方針)。
  await app.register(rateLimit, { global: false });

  // テスト専用のログイン代替ルート: 指定したuserIdでセッションを張るだけ
  app.get<{ Querystring: { userId: string } }>("/test/login", async (req, reply) => {
    req.session.userId = Number(req.query.userId);
    await req.session.save();
    await repository.trackSession(Number(req.query.userId), req.session.sessionId);
    reply.send({ ok: true });
  });
  // 対象セッションが引き続き認証済みとして扱われるかどうかを確認するための
  // 最小限の確認用ルート(既存テスト群と同じ"one step further"パターン)
  app.get("/test/whoami", async (req, reply) => {
    if (!req.session.userId) return reply.status(401).send({ message: "Unauthorized" });
    return reply.send({ userId: req.session.userId });
  });

  // パスワード変更(3.2)と管理者による強制無効化(session-invalidation spec)を
  // 同一インスタンス・同一のSessionRepositoryインスタンス上で連結させる。
  await app.register(profileRoutes);
  await app.register(adminSessionRoutes);
  return { app, repository };
}

function cookieHeader(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function loginAs(app: FastifyInstance, userId: number): Promise<string> {
  const res = await app.inject({ method: "GET", url: `/test/login?userId=${userId}` });
  return cookieHeader(res);
}

describe("パスワード変更後のセッション整合性: 将来の管理者による強制無効化の追跡対象として維持される (task 5.1)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await new RedisMock().flushall();
    (AuthRepository.findPasswordHashById as any).mockImplementation(
      async (userId: number) => (userId === MEMBER_USER_ID ? CURRENT_PASSWORD_HASH : null)
    );
    (AuthRepository.updatePasswordHash as any).mockResolvedValue(1);
    (AuthRepository.findById as any).mockImplementation(
      async (userId: number) => usersById[userId] ?? null
    );
  });

  it("本人のパスワード変更成功後に生き残ったセッションは、後続の管理者による強制無効化で実際に無効化される", async () => {
    const redisClient = new RedisMock();
    const { app, repository } = await buildTestApp(redisClient);

    // 1. 一般ユーザー(本人)がログインする
    const ownCookie = await loginAs(app, MEMBER_USER_ID);

    // 2. 本人が自分のパスワードを変更する。invalidatedCount:1は、変更前に存在した
    //    唯一のセッション(=このセッション自身)が一度無効化された後、
    //    controller側のtrackSessionによって索引に再登録されたことを意味する
    //    (profile.password.api.test.tsで既に検証済みの直接的な観測結果)。
    const changeRes = await app.inject({
      method: "PATCH",
      url: "/profile/password",
      headers: { cookie: ownCookie },
      payload: { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(changeRes.statusCode).toBe(200);
    expect(changeRes.json()).toEqual({ message: "password updated", invalidatedCount: 1 });

    // パスワード変更直後: 本人のセッションはまだ生きており、索引にも1件だけ残っている
    const whoamiAfterChange = await app.inject({
      method: "GET",
      url: "/test/whoami",
      headers: { cookie: ownCookie },
    });
    expect(whoamiAfterChange.statusCode).toBe(200);
    expect(await repository.listSessionIds(MEMBER_USER_ID)).toHaveLength(1);

    // 3. 管理者が、同じユーザーに対して実際の強制セッション無効化エンドポイントを叩く
    //    (SessionService.invalidateUserSessions / DELETE /admin/sessions/:userId、
    //    session-invalidation specで既に導入済みの機構をそのまま利用)。
    const adminCookie = await loginAs(app, ADMIN_USER_ID);
    const invalidateRes = await app.inject({
      method: "DELETE",
      url: `/admin/sessions/${MEMBER_USER_ID}`,
      headers: { cookie: adminCookie },
    });
    expect(invalidateRes.statusCode).toBe(200);
    // invalidatedCount:1は、パスワード変更で生き残った本人のセッションが
    // ちょうど1件、この強制無効化によって実際に捕捉されたことを意味する。
    // trackSessionによる再登録が漏れていた場合、この値は0になり、次のアサーション
    // (本人セッションの失効)も失敗する。
    expect(invalidateRes.json()).toEqual({ invalidatedCount: 1 });
    expect(await repository.listSessionIds(MEMBER_USER_ID)).toEqual([]);

    // 4. one-step-further: パスワード変更後も維持されていた本人のセッションが、
    //    管理者の強制無効化によって実際に失効している(Observable基準そのもの:
    //    「追跡対象への再登録が漏れると、本人はログインしたままだが強制無効化の
    //    対象から漏れてしまう」の裏返しを直接確認する)。
    const whoamiAfterInvalidate = await app.inject({
      method: "GET",
      url: "/test/whoami",
      headers: { cookie: ownCookie },
    });
    expect(whoamiAfterInvalidate.statusCode).toBe(401);

    await app.close();
  });
});
