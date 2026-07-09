// controllers/adminUser.controller.ts
//
// GET /admin/users, PATCH /admin/users/:userId/role, PATCH /admin/users/:userId/status の
// リクエスト解析とAdminUserServiceの呼び出しを担う(design.md "AdminUserController"参照)。
// 権限チェックは行わない — ルート層のadminOnlyGuardが既に確認済みという前提(既存の
// 他コントローラーと同じ規約)。
import { FastifyRequest, FastifyReply } from "fastify";
import { AdminUserService } from "../services/adminUser.service";
import { AppError } from "../errors/AppError";
import { AdminUserParams, ChangeRoleBody, ChangeStatusBody } from "../types/admin";

export const AdminUserController = {
  async list(_req: FastifyRequest, reply: FastifyReply) {
    const users = await AdminUserService.listUsers();
    return reply.send(users);
  },

  async changeRole(
    req: FastifyRequest<{ Params: AdminUserParams; Body: ChangeRoleBody }>,
    reply: FastifyReply
  ) {
    try {
      await AdminUserService.changeRole(req.params.userId, req.body.role);
      return reply.send({ message: "role updated" });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ message: err.message });
      }
      req.log.error(err, "change role failed");
      return reply.code(500).send({ message: "Internal Server Error" });
    }
  },

  async changeStatus(
    req: FastifyRequest<{ Params: AdminUserParams; Body: ChangeStatusBody }>,
    reply: FastifyReply
  ) {
    try {
      const result = await AdminUserService.changeStatus(
        req.params.userId,
        req.body.status
      );

      // 自分自身のアカウントを無効化した場合、そのリクエスト自身の認証状態も
      // 即座に失効させる(design.md "アカウント無効化フロー" / tasks.md 3参照)。
      // admin.session.controller.ts の自己ターゲット無効化と同じ理由・同じ機構:
      // @fastify/sessionはレスポンス送信時に既定でセッションを自動再保存する
      // (onSendフック)ため、何もしないと今無効化したはずのセッションが復活する。
      // req.session.destroy()はこの再保存を止める。
      if (
        req.body.status === "disabled" &&
        req.session.userId === req.params.userId
      ) {
        await req.session.destroy();
      }

      return reply.send(result);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ message: err.message });
      }
      req.log.error(err, "change status failed");
      return reply.code(500).send({ message: "Internal Server Error" });
    }
  },
};
