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

function buildRequestForPath(sessionId: string, path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `sessionId=${sessionId}` },
  });
}

function mockAuthMeResponse(role: string) {
  return {
    ok: true,
    json: async () => ({ id: 1, email: "user@example.com", role }),
  } as unknown as Response;
}

describe("middleware: 認証結果キャッシュのTTL", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockAuthMeResponse("member"))
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

// タスク4.2: /admin配下パスへのロールベースのアクセス制御拡張
//
// design.md「この画面レベルのリダイレクトはUXの補助であり、認可の権威的な判定は
// API側(adminOnlyGuard)が担う」の通り、ここではリダイレクト先の確認のみを行う。
// 非管理者はログアウトさせず、一般ユーザー向け画面(/todos)へリダイレクトする点が
// 未認証時(/loginへリダイレクト)との違い。
describe("middleware: /admin配下のロールベースアクセス制御", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { role: "member", expectedRedirect: "/todos" },
    { role: "admin", expectedRedirect: null },
  ])(
    "role=$role のユーザーが/admin配下にアクセスした場合の挙動",
    async ({ role, expectedRedirect }) => {
      const sessionId = `session-admin-role-${role}`;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(mockAuthMeResponse(role))
      );

      const res = await middleware(buildRequestForPath(sessionId, "/admin/users"));

      if (expectedRedirect) {
        expect(res.headers.get("location")).toBe(
          `http://localhost${expectedRedirect}`
        );
      } else {
        expect(res.headers.get("location")).toBeNull();
      }
    }
  );

  it("未認証ユーザーが/admin配下にアクセスすると/loginにリダイレクトされる", async () => {
    const sessionId = "session-admin-unauthenticated";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response)
    );

    const res = await middleware(buildRequestForPath(sessionId, "/admin/users"));

    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("非/admin配下のパスは、管理者ロールを持たなくてもリダイレクトされない(既存挙動の回帰確認)", async () => {
    const sessionId = "session-non-admin-path";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockAuthMeResponse("member"))
    );

    const res = await middleware(buildRequestForPath(sessionId, "/todos"));

    expect(res.headers.get("location")).toBeNull();
  });
});
