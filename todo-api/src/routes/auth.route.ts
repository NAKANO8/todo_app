import { FastifyInstance } from "fastify";
import { AuthController } from "../controllers/auth.controller";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  }, AuthController.login);

  app.post("/auth/register", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, AuthController.newRegister);

  app.post("/auth/logout", AuthController.logout);
  app.get("/auth/me", AuthController.me);
}