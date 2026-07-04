import { describe, it, expect } from "vitest";
import RedisMock from "ioredis-mock";
import { SessionRepository } from "../session.repository";
import { RedisSessionStore } from "../../session/redisSessionStore";

function buildRepository() {
  const client = new RedisMock();
  const store = new RedisSessionStore(client as any, "sess:");
  const repo = new SessionRepository(client as any, store);
  return { client, store, repo };
}

describe("SessionRepository", () => {
  it("trackSessionで登録したsessionIdがlistSessionIdsに現れる", async () => {
    const { repo } = buildRepository();
    await repo.trackSession(1, "session-a");
    await repo.trackSession(1, "session-b");

    const ids = await repo.listSessionIds(1);
    expect(ids.sort()).toEqual(["session-a", "session-b"]);
  });

  it("untrackSessionは指定した1件だけを索引から除去し、他のセッションは残る", async () => {
    const { repo } = buildRepository();
    await repo.trackSession(1, "session-a");
    await repo.trackSession(1, "session-b");

    await repo.untrackSession(1, "session-a");

    expect(await repo.listSessionIds(1)).toEqual(["session-b"]);
  });

  it("他のユーザーの索引には影響しない", async () => {
    const { repo } = buildRepository();
    await repo.trackSession(1, "session-a");
    await repo.trackSession(2, "session-c");

    await repo.untrackSession(1, "session-a");

    expect(await repo.listSessionIds(2)).toEqual(["session-c"]);
  });

  it("destroySessionは登録済みStoreのdestroyに委譲し、以後そのセッションはgetできなくなる", async () => {
    const { client, store, repo } = buildRepository();
    await new Promise<void>((resolve) =>
      store.set("session-a", { cookie: {} } as any, () => resolve())
    );

    await repo.destroySession("session-a");

    const raw = await client.get("sess:session-a");
    expect(raw).toBeNull();
  });

  it("clearIndexは索引全体を削除する", async () => {
    const { repo } = buildRepository();
    await repo.trackSession(1, "session-a");
    await repo.trackSession(1, "session-b");

    await repo.clearIndex(1);

    expect(await repo.listSessionIds(1)).toEqual([]);
  });
});
