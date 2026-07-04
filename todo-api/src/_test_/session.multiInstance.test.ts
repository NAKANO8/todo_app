import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../session/redisSessionStore";
import { SessionRepository } from "../repositories/session.repository";
import { initSessionRepository } from "../repositories/sessionRepositoryInstance";

// タスク9: 複数todo-apiインスタンス構成でのセッション一貫性確認
//
// 実際に2プロセスを起動して確認するのが本来だが、テスト内でプロセスを複数起動する
// ことはできない。代わりに、同じRedisバックエンド(ioredis-mockは既定でインスタンス間の
// バックエンドを共有する)を指す「独立した2つのFastifyアプリインスタンス」を
// インスタンスA・インスタンスBとして用意する。セッションの実体・逆引き索引は
// どちらもこの共有Redis上にしかないため、これは実際に複数プロセスをRedisで
// 共有した場合と同じ一貫性を証明する妥当な代替手段になっている
// （2.2のwiring testと同じ考え方を、実際のルート/コントローラ層まで広げたもの）。

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

// initSessionRepository()はプロセス内グローバルな1インスタンスしか保持できないため、
// 「複数インスタンス」を同時に存在させるテストでは、各インスタンス用に独立した
// SessionRepositoryオブジェクトを作りつつ、その参照先(client)だけを共有Redisにする。
function buildInstance(sharedRedis: RedisMock) {
  const store = new RedisSessionStore(sharedRedis as any, "sess:");
  const repository = new SessionRepository(sharedRedis as any, store);

  const app = Fastify();
  return (async () => {
    await app.register(cookie);
    await app.register(session, {
      secret: "test_session_secret_that_is_32chars!",
      store,
      cookie: { secure: false },
    });
    app.get<{ Querystring: { userId: string } }>("/test/login", async (req, reply) => {
      // このインスタンスが使うのと同じ共有Redis上のrepositoryに登録する
      req.session.userId = Number(req.query.userId);
      await req.session.save();
      await repository.trackSession(Number(req.query.userId), req.session.sessionId);
      reply.send({ ok: true });
    });
    // adminSessionRoutesのpreHandler/controllerはgetSessionRepository()経由で
    // グローバルなシングルトンを参照するため、このインスタンスでリクエストを
    // 処理する直前にそのインスタンス用のrepositoryへ差し替える。
    app.addHook("onRequest", async () => {
      initSessionRepository(repository);
    });
    await app.register(authRoutes);
    await app.register(adminSessionRoutes);
    return app;
  })();
}

function cookieHeader(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

describe("複数todo-apiインスタンス構成でのセッション一貫性", () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  it("インスタンスAで作成したセッションを、インスタンスBも有効なセッションとして認識する", async () => {
    const sharedRedis = new RedisMock();
    const instanceA = await buildInstance(sharedRedis);
    const instanceB = await buildInstance(sharedRedis);

    const login = await instanceA.inject({ method: "GET", url: "/test/login?userId=2" });

    const meFromB = await instanceB.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookieHeader(login) },
    });

    expect(meFromB.statusCode).toBe(200);

    await instanceA.close();
    await instanceB.close();
  });

  it("インスタンスA経由での無効化が、インスタンスB経由のリクエストにも即座に反映される", async () => {
    const sharedRedis = new RedisMock();
    const instanceA = await buildInstance(sharedRedis);
    const instanceB = await buildInstance(sharedRedis);

    const adminLogin = await instanceA.inject({ method: "GET", url: "/test/login?userId=1" });
    const targetLogin = await instanceA.inject({ method: "GET", url: "/test/login?userId=2" });

    // インスタンスB経由でも認証済みとして認識されることを先に確認
    expect(
      (await instanceB.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookieHeader(targetLogin) } }))
        .statusCode
    ).toBe(200);

    // インスタンスA経由で無効化を実行
    const invalidateRes = await instanceA.inject({
      method: "DELETE",
      url: "/admin/sessions/2",
      headers: { cookie: cookieHeader(adminLogin) },
    });
    expect(invalidateRes.statusCode).toBe(200);

    // インスタンスB経由のリクエストでも、再起動不要で即座に未認証になる
    const meFromB = await instanceB.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookieHeader(targetLogin) },
    });
    expect(meFromB.statusCode).toBe(401);

    await instanceA.close();
    await instanceB.close();
  });
});
