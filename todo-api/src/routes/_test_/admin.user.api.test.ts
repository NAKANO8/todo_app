import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../../session/redisSessionStore";
import { SessionRepository } from "../../repositories/session.repository";
import { initSessionRepository } from "../../repositories/sessionRepositoryInstance";

// タスク3: 管理者向けユーザー管理エンドポイントの統合テスト。AuthRepository/SessionService は
// モックする（admin.session.api.test.ts と同方針）。「最後の有効な管理者」保護のアトミック
// UPDATE自体は1.3/1.4の検証範囲であり対象外。ここでは実装済み契約(対象行基準・affectedRows
// で404/409を判別可能)を前提に、route -> guard -> controller -> service の配線のみを検証する。

type StoredUser = {
  id: number;
  email: string;
  role: "admin" | "member";
  status: "active" | "disabled";
};

let usersById: Record<number, StoredUser>;

function resetUsers() {
  usersById = {
    1: { id: 1, email: "admin1@example.com", role: "admin", status: "active" },
    2: { id: 2, email: "admin2@example.com", role: "admin", status: "active" },
    3: { id: 3, email: "member@example.com", role: "member", status: "active" },
  };
}

function otherActiveAdminsExist(targetId: number): boolean {
  return Object.values(usersById).some(
    (u) => u.id !== targetId && u.role === "admin" && u.status === "active"
  );
}

vi.mock("../../repositories/auth.repository", () => ({
  AuthRepository: { findAll: vi.fn(), findById: vi.fn(), updateRole: vi.fn(), updateStatus: vi.fn() },
}));
vi.mock("../../services/session.service", () => ({
  SessionService: { invalidateUserSessions: vi.fn() },
}));

import { AuthRepository } from "../../repositories/auth.repository";
import { SessionService } from "../../services/session.service";
import { adminUserRoutes } from "../admin.user.route";
import { authRoutes } from "../auth.route";

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

  await app.register(adminUserRoutes);
  // Requirement 2.2 (ロール変更が /auth/me に反映される) 検証用に既存の認証ルートも登録する。
  // AuthController.me は AuthRepository.findById を呼ぶだけで、冒頭のvi.mockが既に効いているため
  // AuthService/AuthController自体は無変更のまま共有できる。
  await app.register(authRoutes);
  return { app, repository };
}

function cookieHeader(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function loginAs(app: FastifyInstance, userId: number): Promise<string> {
  const res = await app.inject({ method: "GET", url: `/test/login?userId=${userId}` });
  return cookieHeader(res);
}

describe("admin.user.route", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetUsers();
    await new RedisMock().flushall();

    (AuthRepository.findAll as any).mockImplementation(async () =>
      Object.values(usersById).map(({ id, email, role, status }) => ({ id, email, role, status }))
    );
    (AuthRepository.findById as any).mockImplementation(async (id: number) => usersById[id] ?? null);
    (AuthRepository.updateRole as any).mockImplementation(async (id: number, newRole: "admin" | "member") => {
      const user = usersById[id];
      if (!user) return 0;
      if (newRole === "member" && !otherActiveAdminsExist(id)) return 0;
      user.role = newRole;
      return 1;
    });
    (AuthRepository.updateStatus as any).mockImplementation(async (id: number, newStatus: "active" | "disabled") => {
      const user = usersById[id];
      if (!user) return 0;
      if (newStatus === "disabled" && !otherActiveAdminsExist(id)) return 0;
      user.status = newStatus;
      return 1;
    });
    (SessionService.invalidateUserSessions as any).mockImplementation(async () => ({ invalidatedCount: 1 }));
  });

  // Requirements 6.1, 6.2: 3エンドポイント共通のガード判定(401/403)。adminOnlyGuardは全
  // エンドポイントに同一preHandlerとして適用されているため、表形式で共通化する。
  const guardedEndpoints: { label: string; method: "GET" | "PATCH"; url: string; payload?: Record<string, unknown> }[] = [
    { label: "GET /admin/users", method: "GET", url: "/admin/users" },
    { label: "PATCH .../role", method: "PATCH", url: "/admin/users/3/role", payload: { role: "member" } },
    { label: "PATCH .../status", method: "PATCH", url: "/admin/users/3/status", payload: { status: "disabled" } },
  ];

  describe.each(guardedEndpoints)("$label のアクセス制御", ({ method, url, payload }) => {
    it("未認証の場合は401を返す", async () => {
      const { app } = await buildTestApp(new RedisMock());
      const res = await app.inject({ method, url, payload });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("管理者以外は403を返す", async () => {
      const { app } = await buildTestApp(new RedisMock());
      const res = await app.inject({ method, url, payload, headers: { cookie: await loginAs(app, 3) } });
      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  // role/status いずれも同じ形の入力検証(AJV)・404判別ロジックを持つため表形式で共通化する。
  const patchTargets = [
    { label: "role", url: (id: number) => `/admin/users/${id}/role`, invalidPayload: { role: "superadmin" }, validPayload: { role: "member" } },
    { label: "status", url: (id: number) => `/admin/users/${id}/status`, invalidPayload: { status: "banned" }, validPayload: { status: "disabled" } },
  ];

  it.each(patchTargets)("不正な$label値は400を返す", async ({ url, invalidPayload }) => {
    const { app } = await buildTestApp(new RedisMock());
    const res = await app.inject({ method: "PATCH", url: url(3), payload: invalidPayload, headers: { cookie: await loginAs(app, 1) } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it.each(patchTargets)("存在しないuserIdへの$label変更は404を返す", async ({ url, validPayload }) => {
    const { app } = await buildTestApp(new RedisMock());
    const res = await app.inject({ method: "PATCH", url: url(999), payload: validPayload, headers: { cookie: await loginAs(app, 1) } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("管理者はGET /admin/usersで全ユーザーをロール・状態付きで取得でき、password_hashは含まれない", async () => {
    const { app } = await buildTestApp(new RedisMock());
    const res = await app.inject({ method: "GET", url: "/admin/users", headers: { cookie: await loginAs(app, 1) } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual([
      { id: 1, email: "admin1@example.com", role: "admin", status: "active" },
      { id: 2, email: "admin2@example.com", role: "admin", status: "active" },
      { id: 3, email: "member@example.com", role: "member", status: "active" },
    ]);
    body.forEach((u: any) => expect(u.password_hash).toBeUndefined());
    await app.close();
  });

  describe("PATCH /admin/users/:userId/role", () => {
    it("最後の有効な管理者を降格しようとすると409を返す(自分自身が対象)", async () => {
      usersById[2].status = "disabled"; // admin1(id=1)だけが有効な管理者になる
      const { app } = await buildTestApp(new RedisMock());
      const res = await app.inject({
        method: "PATCH",
        url: "/admin/users/1/role",
        headers: { cookie: await loginAs(app, 1) },
        payload: { role: "member" },
      });
      expect(res.statusCode).toBe(409);
      expect(usersById[1].role).toBe("admin");
      await app.close();
    });

    it("最後の有効な管理者を降格しようとすると409を返す(第三者が対象。要求者と対象は別ユーザー)", async () => {
      // admin1(id=1)を無効化し admin2(id=2)だけを有効な管理者にする。要求者は無効化済みの
      // admin1自身とし対象(id=2)を降格させる。判定は要求者ではなく対象基準であることを示す。
      usersById[1].status = "disabled";
      const { app } = await buildTestApp(new RedisMock());
      const res = await app.inject({
        method: "PATCH",
        url: "/admin/users/2/role",
        headers: { cookie: await loginAs(app, 1) },
        payload: { role: "member" },
      });
      expect(res.statusCode).toBe(409);
      expect(usersById[2].role).toBe("admin");
      await app.close();
    });

    it("成功すると200を返し、対象ユーザーが次にアカウント情報を取得すると新しいロールが反映されている(Requirement 2.2)", async () => {
      const { app } = await buildTestApp(new RedisMock());
      const patchRes = await app.inject({
        method: "PATCH",
        url: "/admin/users/3/role",
        headers: { cookie: await loginAs(app, 1) },
        payload: { role: "admin" },
      });
      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json()).toEqual({ message: "role updated" });

      const meRes = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: await loginAs(app, 3) } });
      expect(meRes.statusCode).toBe(200);
      expect(meRes.json()).toMatchObject({ id: 3, role: "admin" });
      await app.close();
    });
  });

  describe("PATCH /admin/users/:userId/status", () => {
    it("最後の有効な管理者を無効化しようとすると409を返す", async () => {
      usersById[2].status = "disabled";
      const { app } = await buildTestApp(new RedisMock());
      const res = await app.inject({
        method: "PATCH",
        url: "/admin/users/1/status",
        headers: { cookie: await loginAs(app, 1) },
        payload: { status: "disabled" },
      });
      expect(res.statusCode).toBe(409);
      expect(SessionService.invalidateUserSessions).not.toHaveBeenCalled();
      await app.close();
    });

    it("他ユーザーの無効化に成功すると200かつinvalidatedCountを返し、自分自身のセッションはそのまま有効", async () => {
      const { app } = await buildTestApp(new RedisMock());
      const adminCookie = await loginAs(app, 1);
      const res = await app.inject({
        method: "PATCH",
        url: "/admin/users/3/status",
        headers: { cookie: adminCookie },
        payload: { status: "disabled" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ invalidatedCount: 1 });
      expect(SessionService.invalidateUserSessions).toHaveBeenCalledWith(3);

      // 操作した管理者自身のセッションは無効化されていない(回帰確認)
      const stillAuthedRes = await app.inject({ method: "GET", url: "/admin/users", headers: { cookie: adminCookie } });
      expect(stillAuthedRes.statusCode).toBe(200);
      await app.close();
    });

    it("再有効化に成功すると200かつinvalidatedCount:0を返す", async () => {
      usersById[3].status = "disabled";
      const { app } = await buildTestApp(new RedisMock());
      const res = await app.inject({
        method: "PATCH",
        url: "/admin/users/3/status",
        headers: { cookie: await loginAs(app, 1) },
        payload: { status: "active" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ invalidatedCount: 0 });
      expect(SessionService.invalidateUserSessions).not.toHaveBeenCalled();
      await app.close();
    });

    it("Observable: 管理者が自分自身を無効化すると、レスポンス後は同じセッションでの以降のリクエストが未認証として扱われる", async () => {
      const { app } = await buildTestApp(new RedisMock());
      const adminCookie = await loginAs(app, 1);
      const res = await app.inject({
        method: "PATCH",
        url: "/admin/users/1/status",
        headers: { cookie: adminCookie },
        payload: { status: "disabled" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ invalidatedCount: 1 });

      const followUpRes = await app.inject({ method: "GET", url: "/admin/users", headers: { cookie: adminCookie } });
      expect(followUpRes.statusCode).toBe(401);
      await app.close();
    });
  });
});
