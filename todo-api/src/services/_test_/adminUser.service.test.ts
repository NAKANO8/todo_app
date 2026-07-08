import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminUserService } from "../adminUser.service";
import { AuthRepository } from "../../repositories/auth.repository";
import { SessionService } from "../session.service";

// Repositoryをモック（auth.service.test.ts / todos.service.test.ts と同じパターン）
vi.mock("../../repositories/auth.repository", () => ({
  AuthRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    updateRole: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

vi.mock("../session.service", () => ({
  SessionService: {
    invalidateUserSessions: vi.fn(),
  },
}));

describe("AdminUserService.listUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AuthRepository.findAll() が返す一覧をそのまま返す", async () => {
    const users = [
      { id: 1, email: "a@example.com", role: "admin", status: "active" },
      { id: 2, email: "b@example.com", role: "member", status: "disabled" },
    ];
    (AuthRepository.findAll as any).mockResolvedValue(users);

    const result = await AdminUserService.listUsers();

    expect(result).toEqual(users);
    expect(AuthRepository.findAll).toHaveBeenCalledTimes(1);
  });
});

describe("AdminUserService.changeRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affectedRows=1 (成功) の場合は解決する", async () => {
    (AuthRepository.updateRole as any).mockResolvedValue(1);

    await expect(
      AdminUserService.changeRole(1, "member")
    ).resolves.toBeUndefined();

    expect(AuthRepository.updateRole).toHaveBeenCalledWith(1, "member");
    expect(AuthRepository.findById).not.toHaveBeenCalled();
  });

  it("affectedRows=0 かつ対象ユーザーが存在する場合は409のAppErrorを投げる(最後の管理者保護)", async () => {
    (AuthRepository.updateRole as any).mockResolvedValue(0);
    (AuthRepository.findById as any).mockResolvedValue({
      id: 1,
      email: "sole-admin@example.com",
      role: "admin",
      status: "active",
    });

    await expect(
      AdminUserService.changeRole(1, "member")
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(AuthRepository.findById).toHaveBeenCalledWith(1);
  });

  it("affectedRows=0 かつ対象ユーザーが存在しない場合は404のAppErrorを投げる", async () => {
    (AuthRepository.updateRole as any).mockResolvedValue(0);
    (AuthRepository.findById as any).mockResolvedValue(null);

    await expect(
      AdminUserService.changeRole(999, "member")
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(AuthRepository.findById).toHaveBeenCalledWith(999);
  });
});

describe("AdminUserService.changeStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disabled への変更が成功した場合、SessionService.invalidateUserSessions を呼び出しその結果を返す", async () => {
    (AuthRepository.updateStatus as any).mockResolvedValue(1);
    (SessionService.invalidateUserSessions as any).mockResolvedValue({
      invalidatedCount: 3,
    });

    const result = await AdminUserService.changeStatus(2, "disabled");

    expect(result).toEqual({ invalidatedCount: 3 });
    expect(AuthRepository.updateStatus).toHaveBeenCalledWith(2, "disabled");
    expect(SessionService.invalidateUserSessions).toHaveBeenCalledWith(2);
  });

  it("active への変更(再有効化)が成功した場合、SessionServiceを呼ばずに invalidatedCount:0 を返す", async () => {
    (AuthRepository.updateStatus as any).mockResolvedValue(1);

    const result = await AdminUserService.changeStatus(2, "active");

    expect(result).toEqual({ invalidatedCount: 0 });
    expect(AuthRepository.updateStatus).toHaveBeenCalledWith(2, "active");
    expect(SessionService.invalidateUserSessions).not.toHaveBeenCalled();
  });

  it("affectedRows=0 かつ対象ユーザーが存在する場合は409のAppErrorを投げる(最後の管理者保護)", async () => {
    (AuthRepository.updateStatus as any).mockResolvedValue(0);
    (AuthRepository.findById as any).mockResolvedValue({
      id: 1,
      email: "sole-admin@example.com",
      role: "admin",
      status: "active",
    });

    await expect(
      AdminUserService.changeStatus(1, "disabled")
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(SessionService.invalidateUserSessions).not.toHaveBeenCalled();
  });

  it("affectedRows=0 かつ対象ユーザーが存在しない場合は404のAppErrorを投げる", async () => {
    (AuthRepository.updateStatus as any).mockResolvedValue(0);
    (AuthRepository.findById as any).mockResolvedValue(null);

    await expect(
      AdminUserService.changeStatus(999, "disabled")
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(SessionService.invalidateUserSessions).not.toHaveBeenCalled();
  });

  it("disabled への変更成功後、SessionService.invalidateUserSessions が例外を投げた場合、その例外がそのまま伝播する(ロールバックしない)", async () => {
    (AuthRepository.updateStatus as any).mockResolvedValue(1);
    const sessionError = new Error("redis unavailable");
    (SessionService.invalidateUserSessions as any).mockRejectedValue(
      sessionError
    );

    await expect(AdminUserService.changeStatus(2, "disabled")).rejects.toBe(
      sessionError
    );

    // 状態変更(updateStatus)自体は呼ばれており、取り消されない
    expect(AuthRepository.updateStatus).toHaveBeenCalledWith(2, "disabled");
    expect(SessionService.invalidateUserSessions).toHaveBeenCalledWith(2);
  });
});
