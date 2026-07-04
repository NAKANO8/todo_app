import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

// タスク7: 認証結果キャッシュのTTLを数秒程度に短縮する
//
// 実際のTTL値(3秒)を直接検証すると時間依存で壊れやすいテストになるため、
// 「TTL経過前は再問い合わせしない」「TTL経過後は必ず再問い合わせする」という
// 相対的な振る舞いをフェイクタイマーで検証する。

function buildRequest(sessionId: string) {
  return new NextRequest("http://localhost/todos", {
    headers: { cookie: `sessionId=${sessionId}` },
  });
}

describe("middleware: 認証結果キャッシュのTTL", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true } as Response)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("TTL経過前は同じセッションIDでも再問い合わせしない", async () => {
    const sessionId = "session-ttl-before";
    await middleware(buildRequest(sessionId));
    await middleware(buildRequest(sessionId));

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("TTL経過後は同じセッションIDでも必ず再問い合わせする", async () => {
    const sessionId = "session-ttl-after";
    await middleware(buildRequest(sessionId));

    // TTL(3秒)より確実に長い時間を進める
    vi.advanceTimersByTime(3_001);

    await middleware(buildRequest(sessionId));

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
