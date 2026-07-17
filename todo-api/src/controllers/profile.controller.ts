// controllers/profile.controller.ts
//
// PATCH /profile/name のリクエスト解析とProfileServiceの呼び出しを担う
// (design.md "ProfileController" 参照)。権限チェックは行わない — ルート層の
// requireAuthGuardが既に確認済みという前提(adminUser.controller.tsと同じ規約)。
//
// Requirement 7.1: 対象ユーザーは常に req.session.userId! からのみ取得する。
// リクエストボディ・パスパラメータにuserIdに相当するフィールドは一切定義しない
// (profile.route.tsのスキーマがそもそもnameしか受け付けない)。
import { FastifyRequest, FastifyReply } from "fastify";
import { ProfileService } from "../services/profile.service";
import { AppError } from "../errors/AppError";
import { UpdateNameBody, ChangePasswordBody } from "../types/profile";
import { getSessionRepository } from "../repositories/sessionRepositoryInstance";

export const ProfileController = {
  async updateName(
    req: FastifyRequest<{ Body: UpdateNameBody }>,
    reply: FastifyReply
  ) {
    try {
      await ProfileService.updateName(req.session.userId!, req.body.name);
      return reply.send({ message: "name updated" });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ message: err.message });
      }
      req.log.error(err, "update name failed");
      return reply.code(500).send({ message: "Internal Server Error" });
    }
  },

  async changePassword(
    req: FastifyRequest<{ Body: ChangePasswordBody }>,
    reply: FastifyReply
  ) {
    try {
      const userId = req.session.userId!;
      const { currentPassword, newPassword } = req.body;
      const result = await ProfileService.changePassword(
        userId,
        currentPassword,
        newPassword
      );

      // Requirement 6.2: ProfileService.changePasswordはSessionService経由で対象
      // ユーザーの全セッション(このリクエスト自身のセッションを含む)のRedis上の
      // データと索引を破棄している。@fastify/sessionのonSendフックによる自動再保存
      // により、このリクエスト自身のセッションデータは(req.session.destroy()を
      // 呼ばない限り)結果的に復活するが、userId -> sessionId の逆引き索引
      // (SessionRepository)にはそのままでは戻らない。索引に戻しておかないと、
      // 将来の管理者による強制無効化(admin.session.controller.ts)の対象として
      // このセッションが追跡されなくなってしまうため、ここで明示的に再追跡する
      // (design.md "ProfileController" Implementation Notes参照)。
      await getSessionRepository().trackSession(userId, req.session.sessionId);

      return reply.send({
        message: "password updated",
        invalidatedCount: result.invalidatedCount,
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ message: err.message });
      }
      req.log.error(err, "change password failed");
      return reply.code(500).send({ message: "Internal Server Error" });
    }
  },
};
