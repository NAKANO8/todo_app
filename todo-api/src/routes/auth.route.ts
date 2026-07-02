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
  // Also blocks unexpected fields like `role` from /auth/register — do not relax this
  // without an explicit allowlist, or self-registration can smuggle in a privileged role.
  additionalProperties: false,
} as const;

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", {
    schema: { body: authBodySchema },
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  }, AuthController.login);

  app.post("/auth/register", {
    schema: { body: authBodySchema },
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, AuthController.newRegister);

  app.post("/auth/logout", AuthController.logout);
  app.get("/auth/me", AuthController.me);
}