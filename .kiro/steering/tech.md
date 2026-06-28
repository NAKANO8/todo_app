# Technology Stack

## Architecture

Monorepo with two independent packages (`todo-api`, `todo-web`) managed by pnpm workspaces. The frontend proxies auth calls through Next.js API routes; the browser never calls Fastify directly for auth.

## Core Technologies

- **Language**: TypeScript (strict) — both packages
- **API**: Fastify 5 + Node.js
- **Frontend**: Next.js 16 (App Router) + React 19
- **Database**: MySQL 2
- **Package Manager**: pnpm 11 (workspaces)
- **Containerization**: Docker Compose (dev + prod configs)

## Key Libraries

- `@fastify/session` + `@fastify/cookie` — session management
- `@fastify/rate-limit` — per-route and global rate limiting
- `bcrypt` — password hashing
- `ajv-formats` — email/string format validation in Fastify schemas
- `tailwindcss` v4 — utility-first styling
- `react-toastify` — toast notifications

## Development Standards

### Type Safety
- TypeScript strict mode; avoid `any` (currently one justified cast for ajv-formats plugin type mismatch)
- Domain types defined in `todo-api/src/types/` and `todo-web/lib/types.ts`

### Validation
- API: JSON Schema on Fastify route options (`schema: { body: ... }`) — validated before handlers run
- Frontend: `lib/validation.ts` for client-side pre-checks

### Testing
- Test runner: Vitest (API only)
- Test files colocated in `_test_/` subdirectory beside the layer under test

## Development Environment

### Required Tools
- Node.js, pnpm 11, Docker

### Common Commands
```bash
# Dev (all packages): pnpm dev
# Dev (Docker):       pnpm docker:dev
# Test (API):         cd todo-api && pnpm test
# Build:              pnpm build
```

## Key Technical Decisions

- **Session auth over JWT**: stateful sessions via `@fastify/session`; cookies are `httpOnly`, `sameSite: lax`, `secure` in production
- **Next.js middleware for auth guard**: `middleware.ts` calls `/auth/me` on Fastify, caches result 30s per session ID — no client-side auth logic
- **Trusted proxy config**: Cloudflare CIDRs + Docker internal network (`172.16.0.0/12`) trusted for `X-Forwarded-Proto`
- **Fastify encapsulation for route-level hooks**: `preHandler` hooks added inside route plugin functions scope to that plugin only
