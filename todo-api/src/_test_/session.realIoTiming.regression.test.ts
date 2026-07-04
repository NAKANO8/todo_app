import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";

// 回帰テスト: 「reply.send()の後にreturnを付け忘れると、本物のRedisのような
// 実I/O(イベントループのtick)で完了するセッションストアと組み合わせた時だけ
// 'Cannot write headers after they are sent'でクラッシュする」というバグの再発防止。
//
// このバグはDocker + 実Redis環境での手動動作確認で発見された。原因は
// todos.controller.ts / auth.controller.tsの複数箇所が、成功時に
// `reply.send(...)`を呼ぶだけで`return`していなかったこと。既定のインメモリ
// MemoryStoreは同期的にセッション保存を完了するためこの不具合が隠れていたが、
// 本物のRedis(非同期I/O)に切り替えたことで表面化した。
//
// `ioredis-mock`はマイクロタスク(Promise.resolve().then())相当のタイミングで
// 解決するため、このバグを再現できない。実Redisは本物のソケットI/O、つまり
// マクロタスク(setImmediate相当)で解決するため、ここでは`setImmediate`を使った
// フェイクストアで「実I/Oのタイミング特性」を疑似的に再現する。

class RealIoTimingFakeStore {
  private map = new Map<string, unknown>();

  get(sessionId: string, callback: (err: Error | null, session?: any) => void): void {
    setImmediate(() => callback(null, this.map.get(sessionId)));
  }

  set(sessionId: string, sess: unknown, callback: (err: Error | null) => void): void {
    setImmediate(() => {
      this.map.set(sessionId, sess);
      callback(null);
    });
  }

  destroy(sessionId: string, callback: (err: Error | null) => void): void {
    setImmediate(() => {
      this.map.delete(sessionId);
      callback(null);
    });
  }
}

async function buildTestApp(handler: (req: any, reply: any) => Promise<unknown>) {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(session, {
    secret: "test_session_secret_that_is_32chars!",
    store: new RealIoTimingFakeStore(),
    cookie: { secure: false },
  });
  app.get("/login", async (req, reply) => {
    req.session.userId = 1;
    await req.session.save();
    return reply.send({ ok: true });
  });
  app.get("/target", handler);
  await app.listen({ port: 0, host: "127.0.0.1" });
  return app;
}

async function loginAndFetchTarget(app: ReturnType<typeof Fastify>) {
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  const loginRes = await fetch(`http://127.0.0.1:${port}/login`);
  const setCookie = loginRes.headers.get("set-cookie")!;
  const cookieVal = setCookie.split(";")[0];

  const res = await fetch(`http://127.0.0.1:${port}/target`, {
    headers: { cookie: cookieVal },
  });
  return res;
}

describe("回帰テスト: 実I/Oタイミングのセッションストアとreply.sendの相性", () => {
  it("returnを付けて送信するハンドラは、実I/Oタイミングのストアでもクラッシュしない", async () => {
    const app = await buildTestApp(async (_req, reply) => {
      return reply.send({ ok: true }); // 修正後のパターン
    });

    const res = await loginAndFetchTarget(app);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    await app.close();
  });

  // 注: 「returnを付け忘れたハンドラは実I/Oタイミングのストアでクラッシュする」という
  // バグの再現テストは、サーバープロセス側で未処理例外(ERR_HTTP_HEADERS_SENT)を
  // 実際に発生させてしまい、テストランナー自体を不安定にする(他のテストに影響しうる)
  // ため、恒常的に実行するテストとしては採用しなかった。実際に手元での動作確認と、
  // 本ファイル冒頭のコメントで再現手順・原因は記録している。ここでは代わりに、
  // 「修正後のパターンはクラッシュしない」ことの確認と、下記の静的ガードで
  // 同じ不具合の再発を防ぐ。

  it("todos.controller.tsの全ハンドラが、reply送信時に必ずreturnしている", () => {
    const source = readFileSync(
      join(__dirname, "../controllers/todos.controller.ts"),
      "utf-8"
    );
    assertAllReplySendsAreReturned(source, "todos.controller.ts");
  });

  it("auth.controller.tsの全ハンドラが、reply送信時に必ずreturnしている", () => {
    const source = readFileSync(
      join(__dirname, "../controllers/auth.controller.ts"),
      "utf-8"
    );
    assertAllReplySendsAreReturned(source, "auth.controller.ts");
  });
});

// `reply.xxx(...).send(...)` または `reply.send(...)` を含む行が、
// 必ず `return` から始まっている(または既にreturn済みの分岐内にある)ことを
// 簡易的に検査する。今回のバグの再発防止用の軽量ガード。
function assertAllReplySendsAreReturned(source: string, fileLabel: string) {
  const lines = source.split("\n");
  const offenders: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.includes(".send(")) continue;
    if (!trimmed.startsWith("reply")) continue;
    if (!trimmed.startsWith("return reply")) {
      offenders.push(trimmed);
    }
  }

  expect(offenders, `${fileLabel}: return無しでreply.send()している行: ${offenders.join(" | ")}`).toEqual([]);
}
