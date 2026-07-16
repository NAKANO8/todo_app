import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { ProfileService } from "../profile.service";
import { AuthRepository } from "../../repositories/auth.repository";
import { SessionService } from "../session.service";

// Repositoryをモック（adminUser.service.test.ts と同じパターン）
vi.mock("../../repositories/auth.repository", () => ({
  AuthRepository: {
    updateName: vi.fn(),
    findPasswordHashById: vi.fn(),
    updatePasswordHash: vi.fn(),
  },
}));

vi.mock("../session.service", () => ({
  SessionService: {
    invalidateUserSessions: vi.fn(),
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

describe("ProfileService.updateName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Requirement 2.1, 7.1: 対象は常に呼び出し元が渡した userId のみ
  it("呼び出し元が渡した userId と name をそのまま AuthRepository.updateName に渡す", async () => {
    (AuthRepository.updateName as any).mockResolvedValue(1);

    await expect(
      ProfileService.updateName(5, "New Name")
    ).resolves.toBeUndefined();

    expect(AuthRepository.updateName).toHaveBeenCalledWith(5, "New Name");
    expect(AuthRepository.updateName).toHaveBeenCalledTimes(1);
  });

  it("affectedRows=0 の場合は404のAppErrorを投げる(防御的、通常到達しない)", async () => {
    (AuthRepository.updateName as any).mockResolvedValue(0);

    await expect(
      ProfileService.updateName(999, "New Name")
    ).rejects.toMatchObject({ message: "user not found", statusCode: 404 });
  });
});

describe("ProfileService.changePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Requirement 5.1: 現在のパスワード一致を条件に更新し、成功時は他セッションを無効化する
  it("現在のパスワードが一致する場合、新パスワードをハッシュ化して更新しSessionService.invalidateUserSessionsの結果を返す", async () => {
    (AuthRepository.findPasswordHashById as any).mockResolvedValue(
      "hashed-current-password"
    );
    (bcrypt.compare as any).mockResolvedValue(true);
    (bcrypt.hash as any).mockResolvedValue("hashed-new-password");
    (AuthRepository.updatePasswordHash as any).mockResolvedValue(1);
    (SessionService.invalidateUserSessions as any).mockResolvedValue({
      invalidatedCount: 3,
    });

    const result = await ProfileService.changePassword(
      7,
      "current-password",
      "NewPassword1"
    );

    expect(result).toEqual({ invalidatedCount: 3 });
    expect(AuthRepository.findPasswordHashById).toHaveBeenCalledWith(7);
    expect(bcrypt.compare).toHaveBeenCalledWith(
      "current-password",
      "hashed-current-password"
    );
    expect(bcrypt.hash).toHaveBeenCalledWith("NewPassword1", 10);
    expect(AuthRepository.updatePasswordHash).toHaveBeenCalledWith(
      7,
      "hashed-new-password"
    );
    expect(SessionService.invalidateUserSessions).toHaveBeenCalledWith(7);
  });

  // Requirement 5.2: 現在パスワード不一致は拒否し、更新・セッション無効化は一切行わない
  it("現在のパスワードが一致しない場合、401のAppErrorを投げ、更新もセッション無効化も行われない", async () => {
    (AuthRepository.findPasswordHashById as any).mockResolvedValue(
      "hashed-current-password"
    );
    (bcrypt.compare as any).mockResolvedValue(false);

    await expect(
      ProfileService.changePassword(7, "wrong-password", "NewPassword1")
    ).rejects.toMatchObject({
      message: "current password does not match",
      statusCode: 401,
    });

    expect(AuthRepository.updatePasswordHash).not.toHaveBeenCalled();
    expect(SessionService.invalidateUserSessions).not.toHaveBeenCalled();
  });

  it("対象userIdのパスワードハッシュが見つからない場合は404のAppErrorを投げる(防御的、通常到達しない)", async () => {
    (AuthRepository.findPasswordHashById as any).mockResolvedValue(null);

    await expect(
      ProfileService.changePassword(999, "current-password", "NewPassword1")
    ).rejects.toMatchObject({ message: "user not found", statusCode: 404 });

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(AuthRepository.updatePasswordHash).not.toHaveBeenCalled();
    expect(SessionService.invalidateUserSessions).not.toHaveBeenCalled();
  });

  // Requirement 7.1: userId をリクエスト由来の他の値で上書きできる経路が無いこと
  // (呼び出し元が渡した userId が一貫して全ての下流呼び出しに使われることを確認)
  it("下流の全呼び出し(findPasswordHashById/updatePasswordHash/invalidateUserSessions)が同一のuserIdだけを対象にする", async () => {
    (AuthRepository.findPasswordHashById as any).mockResolvedValue("hash");
    (bcrypt.compare as any).mockResolvedValue(true);
    (bcrypt.hash as any).mockResolvedValue("new-hash");
    (AuthRepository.updatePasswordHash as any).mockResolvedValue(1);
    (SessionService.invalidateUserSessions as any).mockResolvedValue({
      invalidatedCount: 0,
    });

    await ProfileService.changePassword(42, "current-password", "NewPassword1");

    expect(AuthRepository.findPasswordHashById).toHaveBeenCalledWith(42);
    expect(AuthRepository.updatePasswordHash).toHaveBeenCalledWith(
      42,
      "new-hash"
    );
    expect(SessionService.invalidateUserSessions).toHaveBeenCalledWith(42);
  });
});
