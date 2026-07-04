// SessionService
//
// 管理者による「対象ユーザーの全セッション強制無効化」の業務ロジックのみを担う。
// 呼び出し元（ルート層）が既に「リクエスト送信者が認証済みかつ管理者ロールである」ことを
// 確認済みである前提で動作し、このサービス自身は権限チェックを行わない（design.md参照）。
// 対象が呼び出し元の管理者自身であっても特別な分岐は設けない。

import { getSessionRepository } from "../repositories/sessionRepositoryInstance";
import { InvalidateSessionsResult } from "../types/session";

export const SessionService = {
  async invalidateUserSessions(
    targetUserId: number
  ): Promise<InvalidateSessionsResult> {
    const repository = getSessionRepository();
    const sessionIds = await repository.listSessionIds(targetUserId);

    for (const sessionId of sessionIds) {
      await repository.destroySession(sessionId);
    }

    await repository.clearIndex(targetUserId);

    return { invalidatedCount: sessionIds.length };
  },
};
