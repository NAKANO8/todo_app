// guards/requireAuth.ts
import { FastifyRequest, FastifyReply } from "fastify";

// requireAuthGuard: 認証済み(req.session.userIdあり)であることのみを確認する
// 共有preHandler。
//
// 元は todos.route.ts のプラグインスコープにインラインで実装されていた
// 「req.session.userIdがなければ401」の判定を、profile-screen spec
// タスク1.2でこのファイルへ切り出したもの。挙動(401のステータスコード・
// レスポンスボディ)は一切変更していない。ロール・アカウント状態の判定は
// 行わない点で guards/adminOnly.ts の adminOnlyGuard とは責務が異なる
// (design.md "requireAuthGuard" 参照)。今後追加される profile.route.ts
// (タスク3.1/3.2)からも `app.addHook("preHandler", requireAuthGuard)`
// として同一のガードを利用する想定。
export async function requireAuthGuard(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void | FastifyReply> {
  if (!req.session.userId) {
    return reply.status(401).send({ message: "Unauthorized" });
  }
}
