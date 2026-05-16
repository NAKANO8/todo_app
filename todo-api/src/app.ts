// app.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { todoRoutes } from "./routes/todos.route";

export const app = Fastify();

export async function buildApp() {
  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  });

  await app.register(cookie);

  await app.register(session, {
    secret: "super-secret",
    cookie: {
      secure: false,
    },
  });

  await app.register(todoRoutes);

  return app;
}

