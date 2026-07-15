// routes/todos.route.ts
import { FastifyInstance } from "fastify";
import { TodoController } from "../controllers/todos.controller";
import { requireAuthGuard } from "../guards/requireAuth";

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
  // requireAuthGuard: 認証済み(req.session.userIdあり)判定の共有ガード
  // (guards/requireAuth.ts、profile-screen spec タスク1.2)。このプラグインの
  // スコープ内に閉じたpreHandlerなので、他のルートには影響しない
  // (Fastifyのカプセル化)。判定内容・レスポンスは元のインライン実装と同一。
  app.addHook("preHandler", requireAuthGuard);

  app.get("/todos", TodoController.getAll);
  app.get("/todos/:id", TodoController.getById);
  app.post("/todos", { schema: createTodoSchema }, TodoController.create);
  app.patch("/todos/:id", { schema: updateTodoSchema }, TodoController.update);
  app.delete("/todos/:id", TodoController.delete);
}

