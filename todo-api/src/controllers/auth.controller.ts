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
      return reply.send({
        message: 'login success'
      });
    } catch(err) {
      return reply.status(401).send({
        message: "invalid credentials",
      });
    }
  },

  async newRegister(
    req: FastifyRequest<{ Body: LoginBody }>,
    reply: FastifyReply
  ) {
    try {
      await AuthService.register(req.body);
      reply.redirect('/login');
    } catch (err) {
      const e = err as any;

      return reply
      .status(e.statusCode ?? 500)
      .send({ message: e.message ?? "Internal Server Error" });
    }
  },

  async logout(
    req: FastifyRequest,
    reply: FastifyReply
  ) {   
    if (req.session.authenticated) {
      req.session.destroy((err) => {
        if (err) {
          reply.status(500)
          reply.send('Internal Server Error')
        } else {
          reply.redirect('/')
        }
      })
    } else {
      reply.redirect('/')
    }
  }
};