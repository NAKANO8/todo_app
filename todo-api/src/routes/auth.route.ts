import { FastifyInstance } from "fastify";
import { AuthController } from "../controllers/auth.controller";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", AuthController.login);
  app.post("/auth/register", AuthController.newRegister);
  app.post("/auth/logout", AuthController.logout);
  app.get("/auth/me", AuthController.me);
}