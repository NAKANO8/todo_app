// routes/admin.session.route.ts
import { FastifyInstance } from "fastify";
import { AdminSessionController } from "../controllers/admin.session.controller";
import { adminOnlyGuard } from "../guards/adminOnly";

const invalidateSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
} as const;

export async function adminSessionRoutes(app: FastifyInstance) {
  // adminOnlyGuard: 認証済みかつrole===adminであることを確認する共有ガード
  // (guards/adminOnly.ts)。このプラグインのスコープ内に閉じたpreHandlerなので、
  // 他のルートには影響しない（Fastifyのカプセル化）。判定内容・レスポンスは
  // 切り出し前のインライン実装と同一。
  app.addHook("preHandler", adminOnlyGuard);

  app.delete(
    "/admin/sessions/:userId",
    { schema: invalidateSchema },
    AdminSessionController.invalidate
  );
}
