// ProfileService
//
// ログイン中のユーザーが自分自身の表示名を変更し、現在のパスワードの確認を伴って
// 自分自身のパスワードを変更する業務ロジックを担う(design.md "ProfileService" 参照)。
//
// 権限チェックは行わない — 呼び出し元(ルート層のrequireAuthGuard、task 3.1/3.2で
// 実装)が既に「リクエスト送信者が認証済みである」ことを確認済みという前提で動作する
// (AdminUserServiceと同じ規約)。
//
// 対象ユーザーは常に呼び出し元が渡す userId(＝セッションから取得した本人のID)の
// みであり、userId をリクエストボディ・パスパラメータから受け取らない設計そのもの
// によって、他ユーザーを対象にする経路が構造的に存在しない(Requirement 7.1)。
//
// 長さ・強度の検証(name の 1〜50文字、newPassword の強度要件)はルート層のAJV
// スキーマ側の責務であり、このサービスでは行わない(task 3.1/3.2のスコープ)。

import bcrypt from "bcrypt";
import { AppError } from "../errors/AppError";
import { AuthRepository } from "../repositories/auth.repository";
import { SessionService } from "./session.service";

export const ProfileService = {
  async updateName(userId: number, name: string): Promise<void> {
    const affectedRows = await AuthRepository.updateName(userId, name);

    if (affectedRows === 0) {
      // 有効なセッションからは通常発生しない(セッションが指すuserIdの行は
      // 存在するはず)が、防御的に404として扱う(design.md Implementation Notes)。
      throw new AppError("user not found", 404);
    }
  },

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ): Promise<{ invalidatedCount: number }> {
    const passwordHash = await AuthRepository.findPasswordHashById(userId);

    if (passwordHash === null) {
      // updateName と同じ理由で防御的に404(design.md Implementation Notes)。
      throw new AppError("user not found", 404);
    }

    const matched = await bcrypt.compare(currentPassword, passwordHash);

    if (!matched) {
      // Requirement 5.2: 現在のパスワードが一致しない場合は拒否し、更新も
      // セッション無効化も一切行わない。
      throw new AppError("current password does not match", 401);
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await AuthRepository.updatePasswordHash(userId, newPasswordHash);

    // Requirement 6.1: 変更成功時、対象ユーザーの全セッション(このリクエスト
    // 自身のセッションを含む)を強制無効化する。呼び出し元本人のセッションを
    // 維持するかどうかの判断・再追跡はController側の責務であり(design.md
    // Postconditions参照)、このメソッドの契約には含まれない。
    return SessionService.invalidateUserSessions(userId);
  },
};
