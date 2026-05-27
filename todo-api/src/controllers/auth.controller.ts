import { FastifyRequest, FastifyReply } from "fastify";
import { LoginBody } from "../types/todo";
import { AuthService } from "../services/auth.service";

export const AuthController = {
  async login(
    req: FastifyRequest<{ Body: LoginBody }>,
    reply: FastifyReply
  ) {
    try {
      const user = await AuthService.login(req.body);
      req.session.userId = user.id;
      return reply.send({ message: 'login success' });
    } catch {
      return reply.status(401).send({ message: "invalid credentials" });
    }
  },

  async newRegister(
    req: FastifyRequest<{ Body: LoginBody }>,
    reply: FastifyReply
  ) {
    try {
      await AuthService.register(req.body);
      return reply.status(201).send({ message: 'register success' });
    } catch (err) {
      const e = err as Error;
      return reply.status(400).send({ message: e.message ?? "Internal Server Error" });
    }
  },

  async logout(req: FastifyRequest, reply: FastifyReply) {
    if (req.session.userId) {
      req.session.destroy((err) => {
        if (err) {
          reply.status(500).send({ message: 'Internal Server Error' });
        } else {
          reply.send({ message: 'logout success' });
        }
      });
    } else {
      reply.send({ message: 'not logged in' });
    }
  },

  async me(req: FastifyRequest, reply: FastifyReply) {
    const userId = req.session.userId;
    if (!userId) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
    try {
      const user = await AuthService.me(userId);
      return reply.send({ id: user.id, email: user.email });
    } catch {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
  },
};