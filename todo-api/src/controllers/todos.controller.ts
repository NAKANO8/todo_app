// controllers/todos.controller.ts
import { FastifyRequest, FastifyReply } from "fastify";
import { TodoService } from "../services/todos.service";

export const TodoController = {
  async getAll(_: FastifyRequest, reply: FastifyReply) {
    const todos = await TodoService.getAll();
    reply.send(todos);
  },

  async getById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const todo = await TodoService.getById(Number(req.params.id));
      reply.send(todo);
    } catch {
      reply.code(404).send({ message: "Todo not found" });
    }
  },

  async create(req: FastifyRequest<{ Body: { content: string } }>, reply: FastifyReply) {
    try {
      await TodoService.create(req.body.content);
      reply.code(201).send({ message: "created" });
    } catch {
      reply.code(400).send({ message: "invalid content" });
    }
  },

  async update(
    req: FastifyRequest<{ Params: { id: string }, Body: { content?: string; status?: number } }>,
    reply: FastifyReply
  ) {
    try {
      await TodoService.update(Number(req.params.id), req.body);
      reply.send({ message: "updated" });
    } catch {
      reply.code(404).send({ message: "Todo not found" });
    }
  },

  async delete(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      await TodoService.delete(Number(req.params.id));
      reply.send({ message: "deleted" });
    } catch {
      reply.code(404).send({ message: "Todo not found" });
    }
  }
};

