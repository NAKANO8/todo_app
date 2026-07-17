import { describe, it, expect, vi, afterEach } from "vitest";

// タスク4.2: プロフィール向けAPIクライアント(updateProfileName/changeProfilePassword)。
// lib/api/adminUsers.ts / todos.ts と同じ直接fetchパターン(NEXT_PUBLIC_API_BASE,
// credentials: "include", PATCHはJSON body、!res.okならErrorをthrow)に従うこと
// (design.md "Web / Feature" ProfileForm / lib/api/profile.ts参照)。
//
// API_BASE はモジュールのトップレベルで process.env.NEXT_PUBLIC_API_BASE! から読まれるため、
// vi.stubEnv + vi.resetModules + 動的importで、モジュール評価前に値を確定させる。

const API_BASE = "http://localhost:3001";

async function loadProfileModule() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_BASE", API_BASE);
  return import("../profile");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("lib/api/profile", () => {
  describe("updateProfileName", () => {
    it("PATCH /profile/name にnameをcredentials付きで送信する", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: "name updated" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { updateProfileName } = await loadProfileModule();
      await updateProfileName("新しい名前");

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/profile/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "新しい名前" }),
        credentials: "include",
      });
    });

    it("レスポンスが失敗の場合はエラーを投げる(例: 400 バリデーション失敗)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({ message: "invalid name" }),
        })
      );

      const { updateProfileName } = await loadProfileModule();
      await expect(updateProfileName("")).rejects.toThrow();
    });
  });

  describe("changeProfilePassword", () => {
    it("PATCH /profile/password にcurrentPassword/newPasswordを送信し、invalidatedCountを返す", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: "password updated", invalidatedCount: 2 }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { changeProfilePassword } = await loadProfileModule();
      const result = await changeProfilePassword("oldPass1", "newPass1");

      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/profile/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: "oldPass1", newPassword: "newPass1" }),
        credentials: "include",
      });
      expect(result).toMatchObject({ invalidatedCount: 2 });
    });

    it("現在のパスワードが一致しない場合(401)はエラーを投げる", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ message: "current password does not match" }),
        })
      );

      const { changeProfilePassword } = await loadProfileModule();
      await expect(
        changeProfilePassword("wrongPass", "newPass1")
      ).rejects.toThrow();
    });

    it("レート制限に達した場合(429)はエラーを投げる", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({ message: "too many requests" }),
        })
      );

      const { changeProfilePassword } = await loadProfileModule();
      await expect(
        changeProfilePassword("oldPass1", "newPass1")
      ).rejects.toThrow();
    });
  });
});
