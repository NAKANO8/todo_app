import { describe, it, expect } from "vitest";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../redisSessionStore";

// タスク2.1: @fastify/session の Store契約を満たすRedisセッションストアの自前実装
//
// 実Redisサーバーがないサンドボックス環境のため、`ioredis-mock` を注入して検証する。
// `RedisSessionStore` は `get`/`set`/`del` コマンドを呼ぶだけの薄いラッパーであり、
// `@fastify/redis` 登録時の同期的な `client.status === 'ready'` チェック（
// `src/_test_/redis.plugin.test.ts` 参照）のような接続状態確認はこのクラス自身では
// 行わないため、`ioredis-mock` の `status` を明示的に 'ready' にする workaround は不要。
describe("RedisSessionStore", () => {
  it("setで保存したセッションをgetで取得できる（Req 1.1, 4.1, 4.3）", () => {
    const store = new RedisSessionStore(new RedisMock());
    const session = { authenticated: true, userId: 42 };

    return new Promise<void>((resolve, reject) => {
      store.set("session-a", session, (setErr) => {
        try {
          expect(setErr).toBeNull();
        } catch (e) {
          reject(e);
          return;
        }

        store.get("session-a", (getErr, retrieved) => {
          try {
            expect(getErr).toBeNull();
            expect(retrieved).toEqual(session);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  });

  it("destroyしたセッションはgetで「セッションなし」を返す（Req 1.1, 4.3）", () => {
    const store = new RedisSessionStore(new RedisMock());
    const session = { authenticated: true, userId: 7 };

    return new Promise<void>((resolve, reject) => {
      store.set("session-b", session, (setErr) => {
        try {
          expect(setErr).toBeNull();
        } catch (e) {
          reject(e);
          return;
        }

        store.destroy("session-b", (destroyErr) => {
          try {
            expect(destroyErr).toBeNull();
          } catch (e) {
            reject(e);
            return;
          }

          store.get("session-b", (getErr, retrieved) => {
            try {
              expect(getErr).toBeNull();
              expect(retrieved).toBeUndefined();
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        });
      });
    });
  });

  it("存在しないsessionIdをgetしてもエラーにならず「セッションなし」を返す（Req 1.1）", () => {
    const store = new RedisSessionStore(new RedisMock());

    return new Promise<void>((resolve, reject) => {
      store.get("never-existed", (err, retrieved) => {
        try {
          expect(err).toBeNull();
          expect(retrieved).toBeUndefined();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it("prefixを指定した場合、Redis上のキーがprefix付きになる（内部キー命名の確認）", async () => {
    const client = new RedisMock();
    const store = new RedisSessionStore(client, "sess:");
    const session = { authenticated: true, userId: 1 };

    await new Promise<void>((resolve, reject) => {
      store.set("session-c", session, (err) => (err ? reject(err) : resolve()));
    });

    const raw = await client.get("sess:session-c");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(session);

    const rawWithoutPrefix = await client.get("session-c");
    expect(rawWithoutPrefix).toBeNull();
  });
});
