// app.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import formbody from "@fastify/formbody";
import { todoRoutes } from "./routes/todos.route";
import { authRoutes } from "./routes/auth.route";

export const app = Fastify({
  logger: true,
  trustProxy: true,
});

declare module '@fastify/session' {
  interface FastifySessionObject {
    authenticated?: boolean;
    userId?: number;
  }
}

export async function buildApp() {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  });

  await app.register(cookie);

  await app.register(formbody);

  await app.register(session, {
    secret: process.env.SESSION_SECRET!,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "strict",
    },
  });

  await app.register(todoRoutes);
  await app.register(authRoutes);
  return app;
}