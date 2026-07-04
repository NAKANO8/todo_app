import { describe, it, expect, beforeEach } from "vitest";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../../session/redisSessionStore";
import { SessionRepository } from "../../repositories/session.repository";
import { initSessionRepository } from "../../repositories/sessionRepositoryInstance";
import { SessionService } from "../session.service";

function setup() {
  const client = new RedisMock();
  const store = new RedisSessionStore(client as any, "sess:");
  const repository = new SessionRepository(client as any, store);
  initSessionRepository(repository);
  return { client, store, repository };
}

describe("SessionService.invalidateUserSessions", () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  it("対象ユーザーの全セッションを破棄し、索引を空にして件数を返す", async () => {
    const { store, repository } = setup();
    await new Promise<void>((resolve) =>
      store.set("session-a", { cookie: {} } as any, () => resolve())
    );
    await new Promise<void>((resolve) =>
      store.set("session-b", { cookie: {} } as any, () => resolve())
    );
    await repository.trackSession(1, "session-a");
    await repository.trackSession(1, "session-b");

    const result = await SessionService.invalidateUserSessions(1);

    expect(result).toEqual({ invalidatedCount: 2 });
    expect(await repository.listSessionIds(1)).toEqual([]);

    // セッション実体も破棄されていること
    await new Promise<void>((resolve) => {
      store.get("session-a", (_err, session) => {
        expect(session).toBeUndefined();
        resolve();
      });
    });
  });

  it("対象ユーザーに有効セッションが無い場合、エラーにせず0件を返す", async () => {
    setup();

    const result = await SessionService.invalidateUserSessions(999);

    expect(result).toEqual({ invalidatedCount: 0 });
  });

  it("対象が呼び出し元自身であっても特別扱いせず同じ挙動をする", async () => {
    const { store, repository } = setup();
    await new Promise<void>((resolve) =>
      store.set("session-self", { cookie: {} } as any, () => resolve())
    );
    await repository.trackSession(1, "session-self");

    const result = await SessionService.invalidateUserSessions(1);

    expect(result).toEqual({ invalidatedCount: 1 });
    expect(await repository.listSessionIds(1)).toEqual([]);
  });
});
