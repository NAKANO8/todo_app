// controllers/todos.controller.ts
import { FastifyRequest, FastifyReply } from "fastify";
import { TodoService } from "../services/todos.service";

export const TodoController = {
  async getAll(req: FastifyRequest, reply: FastifyReply) {
    const userId = req.session.userId!;
    const todos = await TodoService.getAll(userId);
    reply.send(todos);
  },

  async getById(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const userId = req.session.userId!;
    try {
      const todo = await TodoService.getById(Number(req.params.id), userId);
      reply.send(todo);
    } catch {
      reply.code(404).send({ message: "Todo not found" });
    }
  },

  async create(
    req: FastifyRequest<{ Body: { title: string } }>,
    reply: FastifyReply
  ) {
    const userId = req.session.userId!;
    req.log.info("create todo started");
    try {
      await TodoService.create(req.body.title, userId);
      req.log.info("create todo success");
      reply.code(201).send({ message: "created" });
    } catch (err) {
      req.log.error(err, "create todo failed");
      reply.code(400).send({ message: "invalid title" });
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
      reply.send({ message: "updated" });
    } catch {
      reply.code(404).send({ message: "Todo not found" });
    }
  },

  async delete(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const userId = req.session.userId!;
    try {
      await TodoService.delete(Number(req.params.id), userId);
      reply.send({ message: "deleted" });
    } catch {
      reply.code(404).send({ message: "Todo not found" });
    }
  },
};

