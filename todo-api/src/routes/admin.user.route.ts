// routes/admin.user.route.ts
//
// タスク3: 管理者向けユーザー管理エンドポイント（一覧・ロール変更・状態変更）。
// admin.session.route.ts と同じパターン(プラグインスコープのadminOnlyGuard、
// AJVによるパラメータ/ボディ検証)を踏襲する(design.md "File Structure Plan"参照)。
import { FastifyInstance } from "fastify";
import { AdminUserController } from "../controllers/adminUser.controller";
import { adminOnlyGuard } from "../guards/adminOnly";

const userIdParamsSchema = {
  type: "object",
  required: ["userId"],
  properties: {
    userId: { type: "integer" },
  },
} as const;

const changeRoleSchema = {
  params: userIdParamsSchema,
  body: {
    type: "object",
    required: ["role"],
    properties: {
      role: { type: "string", enum: ["admin", "member"] },
    },
    additionalProperties: false,
  },
} as const;

const changeStatusSchema = {
  params: userIdParamsSchema,
  body: {
    type: "object",
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["active", "disabled"] },
    },
    additionalProperties: false,
  },
} as const;

export async function adminUserRoutes(app: FastifyInstance) {
  // adminOnlyGuard: 認証済みかつrole===adminであることを確認する共有ガード
  // (guards/adminOnly.ts、タスク2.2)。このプラグインのスコープ内に閉じた
  // preHandlerなので、他のルートには影響しない（Fastifyのカプセル化）。
  app.addHook("preHandler", adminOnlyGuard);

  app.get("/admin/users", AdminUserController.list);

  app.patch(
    "/admin/users/:userId/role",
    { schema: changeRoleSchema },
    AdminUserController.changeRole
  );

  app.patch(
    "/admin/users/:userId/status",
    { schema: changeStatusSchema },
    AdminUserController.changeStatus
  );
}
