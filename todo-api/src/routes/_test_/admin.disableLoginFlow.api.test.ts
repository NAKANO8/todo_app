import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import bcrypt from "bcrypt";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../../session/redisSessionStore";
import { SessionRepository } from "../../repositories/session.repository";
import { initSessionRepository } from "../../repositories/sessionRepositoryInstance";

// タスク5.3: アカウント無効化(admin.user.route)から、対象ユーザーの既存セッション失効・
// 新規ログイン拒否(auth.route)までを一気通貫で検証する。
//
// admin.user.api.test.ts は SessionService をモックしているため「呼ばれたか」しか
// 確認できない。ここでは SessionService はモックせず、RedisMock 上に実装された
// 本物のセッションストアを使うことで、対象ユーザーの既存セッションが実際に
// 破棄されることまで確認する。

const TEST_PASSWORD = "Testpassword1";

type StoredUser = {
  id: number;
  email: string;
  password_hash: string;
  role: "admin" | "member";
  status: "active" | "disabled";
};

let usersById: Record<number, StoredUser>;

vi.mock("../../repositories/auth.repository", () => ({
  AuthRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    updateRole: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

import { AuthRepository } from "../../repositories/auth.repository";
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
  await app.register(adminUserRoutes);
  await app.register(authRoutes);
  return app;
}

function sessionCookieFrom(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

describe("アカウント無効化からログイン拒否までの一連の流れ (Requirements 4.2, 4.3)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await new RedisMock().flushall();

    const [adminHash, targetHash] = await Promise.all([
      bcrypt.hash(TEST_PASSWORD, 10),
      bcrypt.hash(TEST_PASSWORD, 10),
    ]);

    usersById = {
      1: { id: 1, email: "admin@example.com", password_hash: adminHash, role: "admin", status: "active" },
      2: { id: 2, email: "target@example.com", password_hash: targetHash, role: "member", status: "active" },
    };

    (AuthRepository.findAll as any).mockImplementation(async () =>
      Object.values(usersById).map(({ password_hash, ...rest }) => rest)
    );
    (AuthRepository.findById as any).mockImplementation(async (id: number) => usersById[id] ?? null);
    (AuthRepository.findByEmail as any).mockImplementation(
      async (email: string) => Object.values(usersById).find((u) => u.email === email) ?? null
    );
    (AuthRepository.updateStatus as any).mockImplementation(
      async (id: number, newStatus: "active" | "disabled") => {
        const user = usersById[id];
        if (!user) return 0;
        user.status = newStatus;
        return 1;
      }
    );
  });

  it("無効化後、対象ユーザーの既存セッションは失効し、新規ログイン試行も拒否される", async () => {
    const app = await buildTestApp(new RedisMock());

    // 対象ユーザー(id=2)が実際にログインし、既存セッションを持っている状態を作る
    const targetLoginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "target@example.com", password: TEST_PASSWORD },
    });
    expect(targetLoginRes.statusCode).toBe(200);
    const targetCookie = sessionCookieFrom(targetLoginRes);

    // 管理者(id=1)がログインし、対象ユーザーを無効化する
    const adminLoginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.com", password: TEST_PASSWORD },
    });
    const adminCookie = sessionCookieFrom(adminLoginRes);

    const disableRes = await app.inject({
      method: "PATCH",
      url: "/admin/users/2/status",
      headers: { cookie: adminCookie },
      payload: { status: "disabled" },
    });
    expect(disableRes.statusCode).toBe(200);
    expect(disableRes.json()).toEqual({ invalidatedCount: 1 });

    // Observable 1 (Requirement 4.2): 対象ユーザーの既存のリクエストが未認証として扱われる
    const meRes = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: targetCookie },
    });
    expect(meRes.statusCode).toBe(401);

    // Observable 2 (Requirement 4.3): 新たなログイン試行も、正しいパスワードでも拒否される
    const reloginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "target@example.com", password: TEST_PASSWORD },
    });
    expect(reloginRes.statusCode).toBe(403);
  });
});
