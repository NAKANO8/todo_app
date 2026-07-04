// SessionRepository
//
// `userId -> sessionId群` の逆引き索引を管理する。`@fastify/session` のセッション実体は
// `sessionId` でしか引けないため、「あるユーザーの全セッションを無効化する」には、
// 別途この索引が必要になる（詳細はdesign.md「SessionRepository」参照）。
//
// 索引はRedisのSet（キー: `user-sessions:<userId>`、値: sessionId群）として保持する。
// セッション実体そのものの破棄は、重複したキー命名ロジックを持たないよう、登録済みの
// `RedisSessionStore`インスタンスの`destroy`に委譲する。

import type * as fastifyRedis from "@fastify/redis";
import { RedisSessionStore } from "../session/redisSessionStore";

type RedisClient = fastifyRedis.FastifyRedis;

export class SessionRepository {
  constructor(
    private readonly client: RedisClient,
    private readonly sessionStore: RedisSessionStore
  ) {}

  private indexKey(userId: number): string {
    return `user-sessions:${userId}`;
  }

  async trackSession(userId: number, sessionId: string): Promise<void> {
    await this.client.sadd(this.indexKey(userId), sessionId);
  }

  async untrackSession(userId: number, sessionId: string): Promise<void> {
    await this.client.srem(this.indexKey(userId), sessionId);
  }

  async listSessionIds(userId: number): Promise<string[]> {
    return this.client.smembers(this.indexKey(userId));
  }

  destroySession(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sessionStore.destroy(sessionId, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async clearIndex(userId: number): Promise<void> {
    await this.client.del(this.indexKey(userId));
  }
}
