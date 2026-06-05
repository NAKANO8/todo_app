import { FastifyRequest, FastifyReply } from "fastify";
import { LoginBody } from "../types/todo";
import { AuthService } from "../services/auth.service";
import { AppError } from "../errors/AppError";

export const AuthController = {
  async login(
    req: FastifyRequest<{ Body: LoginBody }>,
    reply: FastifyReply
  ) {
    try {
      const user = await AuthService.login(req.body);
      req.session.userId = user.id;
      return reply.send({ message: 'login success' });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      req.log.error(err, 'login failed');
      return reply.status(500).send({ message: 'Internal Server Error' });
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
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      req.log.error(err, 'register failed');
      return reply.status(500).send({ message: 'Internal Server Error' });
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
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }
      req.log.error(err, 'me failed');
      return reply.status(500).send({ message: 'Internal Server Error' });
    }
  },
};
