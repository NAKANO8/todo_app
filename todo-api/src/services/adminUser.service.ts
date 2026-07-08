// AdminUserService
//
// 管理者によるユーザー一覧取得・ロール変更・アカウント状態変更の業務ロジックを担う
// (design.md "AdminUserService" コンポーネント参照)。
//
// 権限チェックは行わない — 呼び出し元(ルート層のadminOnlyGuard)が既に
// 「リクエスト送信者が認証済みかつ管理者ロールである」ことを確認済みという前提で
// 動作する(SessionServiceと同じ規約)。
//
// 「有効な管理者が最低1人残る」不変条件は、このサービスでは判定しない。
// AuthRepository.updateRole/updateStatus が、対象行(target)基準の単一の
// 条件付きUPDATE文でアトミックに強制済みであり(リクエストしたのが本人か
// 第三者かは区別しない)、このサービスは戻り値のaffectedRowsのみを見て
// 404(対象が存在しない)/409(不変条件違反)を判別する。
//
// requesterId について: design.mdのAdminUserServiceType契約コード例・シーケンス図には
// changeRole(requesterId, targetUserId, ...) の形が示されているが、同じdesign.mdの
// Invariants節本文は「requesterIdはこの不変条件の判定には使わず、コントローラー側の
// 自己ターゲット時のreq.session.destroy()判定にのみ使う」と明記している。
// tasks.md 2.3 (_Boundary: AdminUserService) も「唯一の管理者に対する降格・無効化要求
// (自分自身に対する要求・他の管理者に対する要求のいずれも)が拒否されることを確認できる」
// という観測可能な振る舞いのみを求めており、requesterIdの受け渡しを要求していない。
// 加えて、既に実装済みのAuthRepository.updateRole/updateStatus(このタスクの依存先)は
// requesterIdを引数に取らないtarget-onlyの契約で確定している。
// 自己ターゲット時のセッション破棄はコントローラー(task 3, 未着手)が
// req.session.userId と req.params.userId を直接比較して判断できるため、
// このサービスにrequesterIdを素通しさせる必要はない。
// よってこのサービスはrequesterIdを受け取らない(design.mdのコード例側が
// 旧revisionの取り残しと判断。詳細はCONCERNS参照)。

import { AppError } from "../errors/AppError";
import {
  AuthRepository,
  AccountStatus,
  UserRole,
} from "../repositories/auth.repository";
import { SessionService } from "./session.service";

export const AdminUserService = {
  async listUsers() {
    return AuthRepository.findAll();
  },

  async changeRole(targetUserId: number, newRole: UserRole): Promise<void> {
    const affectedRows = await AuthRepository.updateRole(targetUserId, newRole);

    if (affectedRows === 0) {
      await assertUpdatePossible(targetUserId);
    }
  },

  async changeStatus(
    targetUserId: number,
    newStatus: AccountStatus
  ): Promise<{ invalidatedCount: number }> {
    const affectedRows = await AuthRepository.updateStatus(
      targetUserId,
      newStatus
    );

    if (affectedRows === 0) {
      await assertUpdatePossible(targetUserId);
    }

    if (newStatus === "disabled") {
      // updateStatusは既に成功している(コミット済み)。この呼び出しが例外を
      // 投げても、状態変更をロールバックせずそのまま呼び出し元へ伝播させる
      // (design.md Implementation Notes / Risks節の意図的な設計判断)。
      return SessionService.invalidateUserSessions(targetUserId);
    }

    return { invalidatedCount: 0 };
  },
};

// affectedRows === 0 の原因を判別する: 対象ユーザーが存在しないなら404、
// 存在するなら(=最後の有効な管理者に対する降格/無効化が拒否された)409を投げる。
async function assertUpdatePossible(targetUserId: number): Promise<never> {
  const target = await AuthRepository.findById(targetUserId);

  if (!target) {
    throw new AppError("user not found", 404);
  }

  throw new AppError(
    "cannot change the last remaining active admin",
    409
  );
}
