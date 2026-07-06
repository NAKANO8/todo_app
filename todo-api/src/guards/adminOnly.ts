// guards/adminOnly.ts
import { FastifyRequest, FastifyReply } from "fastify";
import { AuthRepository } from "../repositories/auth.repository";

// adminOnlyGuard: 認証済みかつ role === "admin" であることを確認する共有preHandler。
//
// 元は admin.session.route.ts (session-invalidation spec) のプラグインスコープに
// インラインで実装されていた判定を、admin-user-management spec タスク2.2で
// このファイルへ切り出したもの。挙動(401/403のステータスコード・レスポンスボディ)は
// 一切変更していない。今後追加される admin.user.route.ts (タスク3) からも
// `app.addHook("preHandler", adminOnlyGuard)` として同一のガードを利用する。
export async function adminOnlyGuard(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void | FastifyReply> {
  if (!req.session.userId) {
    return reply.status(401).send({ message: "Unauthorized" });
  }
  const requester = await AuthRepository.findById(req.session.userId);
  if (!requester || requester.role !== "admin") {
    return reply.status(403).send({ message: "Forbidden" });
  }
}
