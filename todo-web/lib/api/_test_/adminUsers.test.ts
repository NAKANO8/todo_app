import { describe, it, expect, vi, afterEach } from "vitest";

// タスク4.1: 管理者向けAPIクライアント(fetchUsers/updateUserRole/updateUserStatus)。
// lib/api/todos.ts と同じ直接fetchパターン(NEXT_PUBLIC_API_BASE, credentials: "include",
// GETはcache: "no-store", !res.okならthrow)に従うこと(design.md "Web / Feature"参照)。
//
// API_BASE はモジュールのトップレベルで process.env.NEXT_PUBLIC_API_BASE! から読まれるため、
// vi.stubEnv + vi.resetModules + 動的importで、モジュール評価前に値を確定させる。

const API_BASE = "http://localhost:3001";

async function loadAdminUsersModule() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_BASE", API_BASE);
  return import("../adminUsers");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("lib/api/adminUsers", () => {
  describe("fetchUsers", () => {
    it("管理者向け一覧エンドポイントにcredentials付きでGETし、ユーザー一覧を返す", async () => {
      const users = [
        { id: 1, email: "admin@example.com", role: "admin", status: "active" },
        { id: 2, email: "member@example.com", role: "member", status: "disabled" },
      ];
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => users,
      });
      vi.stubGlobal("fetch", fetchMock);

      const { fetchUsers } = await loadAdminUsersModule();
      const result = await fetchUsers();

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/admin/users`, {
        cache: "no-store",
        credentials: "include",
      });
      expect(result).toEqual(users);
    });

    it("レスポンスが失敗の場合はエラーを投げる", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
      );

      const { fetchUsers } = await loadAdminUsersModule();
      await expect(fetchUsers()).rejects.toThrow();
    });
  });

  describe("updateUserRole", () => {
    it("PATCH /admin/users/:userId/role にroleを送信する", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: "role updated" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { updateUserRole } = await loadAdminUsersModule();
      await updateUserRole(42, "admin");

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/admin/users/42/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
        credentials: "include",
      });
    });

    it("レスポンスが失敗の場合はエラーを投げる", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
      );

      const { updateUserRole } = await loadAdminUsersModule();
      await expect(updateUserRole(42, "member")).rejects.toThrow();
    });
  });

  describe("updateUserStatus", () => {
    it("PATCH /admin/users/:userId/status にstatusを送信し、invalidatedCountを返す", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invalidatedCount: 3 }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { updateUserStatus } = await loadAdminUsersModule();
      const result = await updateUserStatus(7, "disabled");

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/admin/users/7/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
        credentials: "include",
      });
      expect(result).toEqual({ invalidatedCount: 3 });
    });

    it("レスポンスが失敗の場合はエラーを投げる", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
      );

      const { updateUserStatus } = await loadAdminUsersModule();
      await expect(updateUserStatus(7, "active")).rejects.toThrow();
    });
  });
});
