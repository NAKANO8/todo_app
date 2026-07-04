import { FastifyRequest, FastifyReply } from "fastify";
import { SessionService } from "../services/session.service";

export const AdminSessionController = {
  async invalidate(
    req: FastifyRequest<{ Params: { userId: number } }>,
    reply: FastifyReply
  ) {
    try {
      const result = await SessionService.invalidateUserSessions(
        req.params.userId
      );

      // 対象が呼び出し元(このリクエスト自身)のセッションだった場合、Redis上のデータは
      // 既に消えているが、Fastifyのセッションミドルウェアはこのリクエストの`req.session`が
      // まだ有効だと思っている。@fastify/sessionはレスポンス送信時に既定でセッションを
      // 自動保存し直す(onSendフック)ため、何もしないと今消したセッションが復活してしまう。
      // `req.session.destroy()`はこの再保存を止める(`request.session = null`にする)ため、
      // 自己ターゲットの場合はここでも明示的に呼ぶ。
      if (req.session.userId === req.params.userId) {
        await req.session.destroy();
      }

      return reply.send(result);
    } catch (err) {
      req.log.error(err, "session invalidation failed");
      return reply.status(500).send({ message: "Internal Server Error" });
    }
  },
};
