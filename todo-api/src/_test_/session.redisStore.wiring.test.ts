import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../session/redisSessionStore";

// タスク2.2: セッションプラグインの既定ストアをRedisストアに切り替える
//
// app.ts の buildApp() はDB接続やSESSION_SECRET等、他の依存を要求するため、
// ここではRedisストア切り替えの配線パターンだけを狙い撃ちで検証する。
//
// 「プロセス再起動をまたいでもセッションが残る」ことは、実プロセスを2回起動して
// 確認するのが本来だが、テスト内でプロセスを再起動することはできない。代わりに、
// 同じ ioredis-mock のバックエンドを共有する「独立した2つのFastifyアプリインスタンス」
// を用意し、片方(instanceA)で作ったセッションをもう片方(instanceB)が読めることを
// 確認する。これは「セッションの実体がプロセスのメモリではなく外部ストア(Redis)に
// あるため、プロセスを跨いでも参照できる」という、再起動後も残ることと同じ性質を
// 証明する代替手段になっている。
async function buildTestApp(redisClient: RedisMock) {
  const app = Fastify();
  await app.register(cookie);
  await app.register(session, {
    secret: "test_session_secret_that_is_32chars!",
    store: new RedisSessionStore(redisClient as any, "sess:"),
    cookie: { secure: false },
  });
  app.get("/login", async (req, reply) => {
    req.session.userId = 42;
    await req.session.save();
    reply.send({ ok: true });
  });
  app.get("/whoami", async (req, reply) => {
    reply.send({ userId: req.session.userId ?? null });
  });
  return app;
}

describe("Redisストアへの切り替え(app.tsの配線パターン)", () => {
  it("あるインスタンスで作られたセッションを、同じRedisを共有する別インスタンスが読める", async () => {
    const sharedRedis = new RedisMock();

    const instanceA = await buildTestApp(sharedRedis);
    const instanceB = await buildTestApp(sharedRedis);

    const loginRes = await instanceA.inject({ method: "GET", url: "/login" });
    const setCookieHeader = loginRes.cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const whoamiRes = await instanceB.inject({
      method: "GET",
      url: "/whoami",
      headers: { cookie: setCookieHeader },
    });

    expect(whoamiRes.json()).toEqual({ userId: 42 });

    await instanceA.close();
    await instanceB.close();
  });
});
