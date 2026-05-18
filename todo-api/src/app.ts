// app.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { todoRoutes } from "./routes/todos.route";

export const app = Fastify({
  logger: true,
});

declare module '@fastify/session' {
  interface FastifySessionObject {
    authenticated?: boolean;
    userId?: number;
  }
}

export async function buildApp() {
  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  });

  await app.register(cookie);

  await app.register(session, {
    secret: process.env.SESSION_SECRET!,
    cookie: {
      secure: false,
    },
  });

  await app.register(todoRoutes);

  return app;
}