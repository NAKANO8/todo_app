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

    it("レスポンスが失敗の場合、statusとサーバーのmessageを持つAdminApiErrorを投げる", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ message: "boom" }),
        })
      );

      const { fetchUsers, AdminApiError } = await loadAdminUsersModule();
      await expect(fetchUsers()).rejects.toMatchObject(
        new AdminApiError(500, "boom")
      );
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

    it("最後の管理者保護で拒否された場合(409)、サーバーのmessageを持つAdminApiErrorを投げる", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 409,
          json: async () => ({ message: "cannot change the last remaining active admin" }),
        })
      );

      const { updateUserRole, AdminApiError } = await loadAdminUsersModule();
      await expect(updateUserRole(42, "member")).rejects.toMatchObject(
        new AdminApiError(409, "cannot change the last remaining active admin")
      );
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

    it("対象ユーザーが存在しない場合(404)、サーバーのmessageを持つAdminApiErrorを投げる", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          json: async () => ({ message: "user not found" }),
        })
      );

      const { updateUserStatus, AdminApiError } = await loadAdminUsersModule();
      await expect(updateUserStatus(7, "active")).rejects.toMatchObject(
        new AdminApiError(404, "user not found")
      );
    });
  });
});
