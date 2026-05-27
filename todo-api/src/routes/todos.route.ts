// routes/todos.route.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { TodoController } from "../controllers/todos.controller";

export async function todoRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.session.userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }
  });

  app.get("/todos", TodoController.getAll);
  app.get("/todos/:id", TodoController.getById);
  app.post("/todos", TodoController.create);
  app.patch("/todos/:id", TodoController.update);
  app.delete("/todos/:id", TodoController.delete);
}

