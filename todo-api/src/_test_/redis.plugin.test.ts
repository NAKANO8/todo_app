import { describe, it, expect, afterAll } from "vitest";
import Fastify from "fastify";
import fastifyRedis from "@fastify/redis";
import RedisMock from "ioredis-mock";

// タスク1.2: todo-apiにRedis接続を登録する
//
// このテストは `app.ts` のフルビルド (buildApp()) には依存しない、独立した最小Fastify
// インスタンスで検証する。理由: buildApp() はDB接続・セッションシークレットなど他の
// 依存を要求するため、Redis接続配線だけを狙い撃ちで検証するにはノイズが大きい。
//
// また実Redisサーバーがないサンドボックス環境のため、`@fastify/redis` の `client` オプション
// に ioredis-mock のインスタンスを直接渡すことで、実ネットワーク接続なしに
// 「デコレータ経由で共有クライアントにアクセスし、コマンドを実行できる」という配線パターン
// のみを検証する。ホスト・ポート指定による実接続経路 (app.ts が本番で使う経路) はここでは
// 検証できない。
describe("@fastify/redis registration", () => {
  it("登録後、共有クライアント経由でRedisコマンドを実行できる", async () => {
    const app = Fastify();
    const mockClient = new RedisMock();
    // ioredis-mock は ioredis 本来の `status` ステートマシン（wait/connecting/ready 等）を
    // 実装しておらず常に undefined のままなので、@fastify/redis 側の
    // `client.status === 'ready'` という同期チェックが素通りしてしまい、
    // 代わりに 'ready' イベント待ちの経路に入る。しかしそのイベントは
    // インスタンス生成直後（@fastify/redis がリスナーを張るより前）に発火済みのため
    // 拾えず、登録がハング/タイムアウトする。実Redis接続では発生しない
    // ioredis-mock固有の既知の相性問題であり、`status` を明示的に 'ready' にして
    // @fastify/redis の同期フェストパスを通すことで回避する。
    mockClient.status = "ready";

    await app.register(fastifyRedis, { client: mockClient });
    await app.ready();

    expect(app.redis).toBeDefined();

    await app.redis.set("session-plugin-check", "ok");
    const value = await app.redis.get("session-plugin-check");

    expect(value).toBe("ok");

    await app.close();
  });
});
