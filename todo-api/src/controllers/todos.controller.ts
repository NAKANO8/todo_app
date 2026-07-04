// controllers/todos.controller.ts
import { FastifyRequest, FastifyReply } from "fastify";
import { TodoService } from "../services/todos.service";
import { AppError } from "../errors/AppError";

export const TodoController = {
  async getAll(req: FastifyRequest, reply: FastifyReply) {
    const userId = req.session.userId!;
    const todos = await TodoService.getAll(userId);
    return reply.send(todos);
  },

  async getById(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const userId = req.session.userId!;
    try {
      const todo = await TodoService.getById(Number(req.params.id), userId);
      return reply.send(todo);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ message: err.message });
      }
      req.log.error(err, 'getById failed');
      return reply.code(500).send({ message: 'Internal Server Error' });
    }
  },

  async create(
    req: FastifyRequest<{ Body: { title: string } }>,
    reply: FastifyReply
  ) {
    const userId = req.session.userId!;
    try {
      await TodoService.create(req.body.title, userId);
      return reply.code(201).send({ message: "created" });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ message: err.message });
      }
      req.log.error(err, 'create todo failed');
      return reply.code(500).send({ message: 'Internal Server Error' });
    }
  },

  async update(
    req: FastifyRequest<{
      Params: { id: string };
      Body: { title?: string; status?: number };
    }>,
    reply: FastifyReply
  ) {
    const userId = req.session.userId!;
    try {
      await TodoService.update(Number(req.params.id), userId, req.body);
      return reply.send({ message: "updated" });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ message: err.message });
      }
      req.log.error(err, 'update todo failed');
      return reply.code(500).send({ message: 'Internal Server Error' });
    }
  },

  async delete(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const userId = req.session.userId!;
    try {
      await TodoService.delete(Number(req.params.id), userId);
      return reply.send({ message: "deleted" });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ message: err.message });
      }
      req.log.error(err, 'delete todo failed');
      return reply.code(500).send({ message: 'Internal Server Error' });
    }
  },
};
