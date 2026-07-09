import { describe, it, expect, vi, afterEach } from "vitest";

// lib/api/todos.ts / adminUsers.ts と同じ直接fetchパターン(NEXT_PUBLIC_API_BASE,
// credentials: "include", cache: "no-store", !res.okならthrow)に従う。
//
// API_BASE はモジュールのトップレベルで process.env.NEXT_PUBLIC_API_BASE! から読まれるため、
// vi.stubEnv + vi.resetModules + 動的importで、モジュール評価前に値を確定させる。

const API_BASE = "http://localhost:3001";

async function loadAuthModule() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_BASE", API_BASE);
  return import("../auth");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("lib/api/auth", () => {
  describe("fetchMe", () => {
    it("/auth/me にcredentials付きでGETし、現在のユーザー情報を返す", async () => {
      const me = { id: 1, email: "admin@example.com", role: "admin" };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => me,
      });
      vi.stubGlobal("fetch", fetchMock);

      const { fetchMe } = await loadAuthModule();
      const result = await fetchMe();

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/auth/me`, {
        cache: "no-store",
        credentials: "include",
      });
      expect(result).toEqual(me);
    });

    it("レスポンスが失敗の場合はエラーを投げる", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
      );

      const { fetchMe } = await loadAuthModule();
      await expect(fetchMe()).rejects.toThrow();
    });
  });
});
