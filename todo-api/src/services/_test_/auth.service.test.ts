import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { AuthService } from "../auth.service";
import { AuthRepository } from "../../repositories/auth.repository";

// Repositoryをモック（todos.service.test.ts と同じパターン）
vi.mock("../../repositories/auth.repository", () => ({
  AuthRepository: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    createUser: vi.fn(),
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

describe("AuthService.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("無効化されたアカウントに正しいパスワードでログインすると403のAppErrorを投げる", async () => {
    (AuthRepository.findByEmail as any).mockResolvedValue({
      id: 1,
      email: "disabled@example.com",
      password_hash: "hashed",
      role: "member",
      status: "disabled",
    });
    (bcrypt.compare as any).mockResolvedValue(true);

    await expect(
      AuthService.login({ email: "disabled@example.com", password: "correct-password" })
    ).rejects.toMatchObject({ message: "account disabled", statusCode: 403 });
  });

  it("無効化されたアカウントに誤ったパスワードでログインすると401のまま(disabled状態を漏らさない)", async () => {
    (AuthRepository.findByEmail as any).mockResolvedValue({
      id: 1,
      email: "disabled@example.com",
      password_hash: "hashed",
      role: "member",
      status: "disabled",
    });
    (bcrypt.compare as any).mockResolvedValue(false);

    await expect(
      AuthService.login({ email: "disabled@example.com", password: "wrong-password" })
    ).rejects.toMatchObject({ message: "invalid credentials", statusCode: 401 });
  });

  it("有効なアカウントに正しいパスワードでログインすると成功する(回帰)", async () => {
    const user = {
      id: 2,
      email: "active@example.com",
      password_hash: "hashed",
      role: "member",
      status: "active",
    };
    (AuthRepository.findByEmail as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(true);

    const result = await AuthService.login({ email: "active@example.com", password: "correct-password" });

    expect(result).toEqual(user);
  });

  it("再有効化されたアカウント(status=active)は正しいパスワードで通常通りログインできる", async () => {
    const reEnabledUser = {
      id: 3,
      email: "re-enabled@example.com",
      password_hash: "hashed",
      role: "member",
      status: "active",
    };
    (AuthRepository.findByEmail as any).mockResolvedValue(reEnabledUser);
    (bcrypt.compare as any).mockResolvedValue(true);

    const result = await AuthService.login({ email: "re-enabled@example.com", password: "correct-password" });

    expect(result).toEqual(reEnabledUser);
  });
});
