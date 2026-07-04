import { FastifyRequest, FastifyReply } from "fastify";
import { LoginBody } from "../types/todo";
import { AuthService } from "../services/auth.service";
import { AppError } from "../errors/AppError";
import { getSessionRepository } from "../repositories/sessionRepositoryInstance";

export const AuthController = {
  async login(
    req: FastifyRequest<{ Body: LoginBody }>,
    reply: FastifyReply
  ) {
    try {
      const user = await AuthService.login(req.body);
      req.session.userId = user.id;
      await getSessionRepository().trackSession(user.id, req.session.sessionId);
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
    const cookieClearOptions = {
      path: '/',
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.COOKIE_SECURE === 'true',
      domain: process.env.COOKIE_DOMAIN,
    };

    if (req.session.userId) {
      const userId = req.session.userId;
      const sessionId = req.session.sessionId;
      await getSessionRepository().untrackSession(userId, sessionId);

      try {
        await new Promise<void>((resolve, reject) => {
          req.session.destroy((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch (err) {
        req.log.error(err, 'logout failed');
        return reply.status(500).send({ message: 'Internal Server Error' });
      }

      return reply.clearCookie('sessionId', cookieClearOptions).send({ message: 'logout success' });
    } else {
      return reply.clearCookie('sessionId', cookieClearOptions).send({ message: 'not logged in' });
    }
  },

  async me(req: FastifyRequest, reply: FastifyReply) {
    const userId = req.session.userId;
    if (!userId) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
    try {
      const user = await AuthService.me(userId);
      return reply.send({ id: user.id, email: user.email, role: user.role });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }
      req.log.error(err, 'me failed');
      return reply.status(500).send({ message: 'Internal Server Error' });
    }
  },
};
