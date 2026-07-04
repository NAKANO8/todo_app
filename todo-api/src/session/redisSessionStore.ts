// RedisSessionStore
//
// なぜ自前実装なのか（外部Storeアダプタを採用しなかった理由）
// ----------------------------------------------------------
// `@fastify/session` の `store` オプションには、セッションの読み書き・破棄だけを行う
// 薄い `Store` 契約（get/set/destroyの3メソッドのみ）を満たす実装を渡せる。Redis向けの
// 実装として以下の外部パッケージを検討したが、いずれも保守状況が悪く採用を見送った。
//   - `fastify-session-redis-store`（`connect-redis` のフォーク）: 公開バージョンは3つのみ、
//     最新版も2024年6月が最後の更新でGitHubスターも2件と、採用実績・保守状況の両面で
//     信頼性に欠ける。
//   - `@mgcrea/fastify-session-redis-store`: 別フォーク系統の `@mgcrea/fastify-session`
//     向けであり、本プロジェクトが使っている公式 `@fastify/session` とはそもそも組み合わせ
//     不可。GitHub上の最終更新も4年前で放置されている。
//   - （参考）定番の `connect-redis` は v7以降 `express-session` をpeer依存にしたため、
//     `@fastify/session` とは直接互換しない。
// `Store` 契約自体はGET/SET/DELをRedisに委譲するだけで済むほど薄いため、外部パッケージの
// サプライチェーンリスクを負うより、中身を完全に把握・制御できる自前実装の方が優れると判断した。
// Redis接続の確立・共有はFastifyとの統合が複雑になりがちなので、そこは実績のある公式プラグイン
// `@fastify/redis`（ioredisベース、継続メンテ中）に任せ、このクラスはその上に乗る薄いラッパーに
// 徹する。
//
// このクラスが満たす契約
// ----------------------------------------------------------
// `@fastify/session` が要求する `Store` 契約に従い、以下の3メソッドのみを実装する。
//   - get(sessionId, callback): 保存済みセッションを取得する。
//     - 見つかった場合: `callback(null, session)` （`session` はデシリアライズ済みのオブジェクト）
//     - 見つからない場合（「セッションなし」）: エラー扱いにせず `callback(null, undefined)` を返す
//   - set(sessionId, session, callback): セッションデータをシリアライズしてRedisに書き込み、
//     完了したら `callback(null)` を呼ぶ。
//   - destroy(sessionId, callback): 該当キーをRedisから削除し、完了したら `callback(null)` を呼ぶ。
//     破棄後の `get` は上記の「セッションなし」の挙動を返す。
// 3メソッドとも例外を投げず、必ずNode形式のコールバック（第1引数にエラー、成功時は`null`）で
// 結果を返す。キー命名は `<prefix><sessionId>` の単純な文字列結合とし、有効期限（TTL）は
// このクラスでは設定しない。

import type * as fastifyRedis from "@fastify/redis";
import type { Session } from "fastify";

// 実運用では `@fastify/redis` が提供する ioredis クライアント（`app.redis`）を、
// テストでは構造的に同じ get/set/del を持つ `ioredis-mock` のインスタンスを注入できるよう、
// クライアントの型は `@fastify/redis` が公開する型（内部的には ioredis の `Redis` 型）を
// 経由して参照する。ioredis自体は `@fastify/redis` の推移的依存であり、このパッケージから
// 直接 `import ... from "ioredis"` を解決できないため、この経路で型を得る。
type RedisClient = fastifyRedis.FastifyRedis;

const DEFAULT_PREFIX = "";

export class RedisSessionStore {
  private readonly client: RedisClient;
  private readonly prefix: string;

  constructor(client: RedisClient, prefix: string = DEFAULT_PREFIX) {
    this.client = client;
    this.prefix = prefix;
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  get(
    sessionId: string,
    callback: (err: Error | null, session?: Session | null) => void
  ): void {
    this.client
      .get(this.key(sessionId))
      .then((raw) => {
        if (raw === null || raw === undefined) {
          callback(null, undefined);
          return;
        }
        callback(null, JSON.parse(raw) as Session);
      })
      .catch((err: Error) => callback(err));
  }

  set(
    sessionId: string,
    session: Session,
    callback: (err: Error | null) => void
  ): void {
    this.client
      .set(this.key(sessionId), JSON.stringify(session))
      .then(() => callback(null))
      .catch((err: Error) => callback(err));
  }

  destroy(sessionId: string, callback: (err: Error | null) => void): void {
    this.client
      .del(this.key(sessionId))
      .then(() => callback(null))
      .catch((err: Error) => callback(err));
  }
}
