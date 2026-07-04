// routes/admin.session.route.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AdminSessionController } from "../controllers/admin.session.controller";
import { AuthRepository } from "../repositories/auth.repository";

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
  // AdminRoleGuard: 認証済みかつrole===adminであることを確認する。このプラグインの
  // スコープ内に閉じたpreHandlerなので、他のルートには影響しない（Fastifyのカプセル化）。
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.session.userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }
    const requester = await AuthRepository.findById(req.session.userId);
    if (!requester || requester.role !== "admin") {
      return reply.status(403).send({ message: "Forbidden" });
    }
  });

  app.delete(
    "/admin/sessions/:userId",
    { schema: invalidateSchema },
    AdminSessionController.invalidate
  );
}
