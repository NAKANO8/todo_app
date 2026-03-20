// routes/todos.route.ts
import { FastifyInstance } from "fastify";
import { TodoController } from "../controllers/todos.controller";

export async function todoRoutes(app: FastifyInstance) {
  app.get("/todos", TodoController.getAll);
  app.get("/todos/:id", TodoController.getById);
  app.post("/todos", TodoController.create);
  app.patch("/todos/:id", TodoController.update);
  app.delete("/todos/:id", TodoController.delete);
}

