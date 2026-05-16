import { FastifyRequest, FastifyReply } from "fastify";
import { LoginBody } from "../types/todo"; 

export const AuthController = {
  async login(
    req: FastifyRequest<{ Body: LoginBody }>,
    reply: FastifyReply
  ) {
    const { email, password } = req.body;

    if (password === "abcdef") {
      req.session.authenticated = true;
      req.session.userId = users.id;

      return reply.send({
        message: "login success",
      });
    }

    return reply.status(401).send({
      message: "invalid credentials",
    });
  },

  async newRegister(
    req: FastifyRequest<{ Body: LoginBody }>,
    reply: FastifyReply
  ) {
    try {
      await authService.register(req.body);
      reply.redirect('/login');
    } catch (err) {
      reply.status(err.statusCode || 500).send(err.message);
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