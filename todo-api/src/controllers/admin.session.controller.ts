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
      return reply.send(result);
    } catch (err) {
      req.log.error(err, "session invalidation failed");
      return reply.status(500).send({ message: "Internal Server Error" });
    }
  },
};
