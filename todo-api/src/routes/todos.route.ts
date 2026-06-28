// routes/todos.route.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { TodoController } from "../controllers/todos.controller";

const createTodoSchema = {
  body: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 100 },
    },
    additionalProperties: false,
  },
} as const;

const updateTodoSchema = {
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 100 },
      status: { type: "integer", enum: [0, 1] },
    },
    additionalProperties: false,
    minProperties: 1,
  },
} as const;

export async function todoRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.session.userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }
  });

  app.get("/todos", TodoController.getAll);
  app.get("/todos/:id", TodoController.getById);
  app.post("/todos", { schema: createTodoSchema }, TodoController.create);
  app.patch("/todos/:id", { schema: updateTodoSchema }, TodoController.update);
  app.delete("/todos/:id", TodoController.delete);
}

