import { FastifyInstance } from "fastify";
import { AuthController } from "../controllers/auth.controller";

// Shared with profile.route.ts (password change) so both entry points enforce the
// exact same strength requirement.
export const passwordFieldSchema = {
  type: "string",
  minLength: 8,
  maxLength: 128,
  pattern: "^(?=.*[A-Z])(?=.*\\d)[A-Za-z\\d]{8,}$",
} as const;

// Requirement 3.3: 表示名は1〜50文字。profile.route.ts (表示名変更) でも再利用する。
export const nameFieldSchema = {
  type: "string",
  minLength: 1,
  maxLength: 50,
} as const;

// Login must NOT require or accept `name` — it authenticates an existing account,
// it doesn't set one. Keep this schema functionally identical to the pre-split
// authBodySchema so existing login behavior is unaffected.
const loginBodySchema = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", format: "email", maxLength: 255 },
    password: passwordFieldSchema,
  },
  // Also prevents unexpected fields like `role` from being smuggled in. Note: Fastify 5's
  // default AJV config sets removeAdditional: true, so unknown fields are silently
  // stripped before the handler runs — the request still succeeds (2xx), it does NOT
  // reject with 400. Don't assume a 400 here.
  additionalProperties: false,
} as const;

// Requirement 3.1/3.2/3.3: registration requires `name` (1-50 chars), separate from login.
const registerBodySchema = {
  type: "object",
  required: ["email", "password", "name"],
  properties: {
    email: { type: "string", format: "email", maxLength: 255 },
    password: passwordFieldSchema,
    name: nameFieldSchema,
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
    schema: { body: loginBodySchema },
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  }, AuthController.login);

  app.post("/auth/register", {
    schema: { body: registerBodySchema },
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, AuthController.newRegister);

  app.post("/auth/logout", AuthController.logout);
  app.get("/auth/me", AuthController.me);
}