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
import { UpdateNameBody } from "../types/profile";

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
};
