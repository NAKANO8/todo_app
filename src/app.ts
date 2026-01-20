// app.ts
import Fastify from "fastify";
import { todoRoutes } from "./routes/todos.route";

export const app = Fastify();
app.register(todoRoutes);

