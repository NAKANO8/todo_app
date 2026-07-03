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
  // Also prevents unexpected fields like `role` from /auth/register — do not relax this
  // without an explicit allowlist, or self-registration can smuggle in a privileged role.
  // Note: Fastify 5's default AJV config sets removeAdditional: true, so unknown fields
  // (e.g. `role`) are silently stripped before the handler runs — the request still
  // succeeds (2xx), it does NOT reject with 400. Don't assume a 400 here.
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