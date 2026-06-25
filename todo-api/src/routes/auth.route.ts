import { FastifyInstance } from "fastify";
import { AuthController } from "../controllers/auth.controller";

const authBodySchema = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", format: "email", maxLength: 255 },
    password: {
      type: "string",
      minLength: 8,
      maxLength: 128,
      pattern: "^(?=.*[A-Z])(?=.*\\d)[A-Za-z\\d]{8,}$",
    },
  },
  additionalProperties: false,
} as const;

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", { schema: { body: authBodySchema } }, AuthController.login);
  app.post("/auth/register", { schema: { body: authBodySchema } }, AuthController.newRegister);
  app.post("/auth/logout", AuthController.logout);
  app.get("/auth/me", AuthController.me);
}