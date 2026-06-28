# Project Structure

## Organization Philosophy

Monorepo with two distinct packages. Each package follows a layered architecture — requests flow through routes → controllers → services → repositories → DB.

## Directory Patterns

### API (`todo-api/src/`)
Strict layer separation; each layer has a single responsibility:

| Layer | Directory | Role |
|---|---|---|
| Entry | `app.ts`, `server.ts` | Fastify setup, plugin registration |
| Routes | `routes/` | Schema validation + hook registration; delegates to controllers |
| Controllers | `controllers/` | Parse request, call service, send response |
| Services | `services/` | Business logic, error handling |
| Repositories | `repositories/` | Raw SQL queries via mysql2 |
| Types | `types/` | Shared domain types |
| Errors | `errors/` | Custom error classes (`AppError`) |
| DB | `db/` | MySQL connection client |

Tests live in `_test_/` within each layer directory (e.g., `services/_test_/`).

### Frontend (`todo-web/`)
Feature-first with shared primitives:

- **`app/`** — Next.js App Router pages and API route handlers
  - `app/api/auth/` — proxy routes that forward auth calls to Fastify
- **`features/`** — self-contained feature modules (auth, todo, landing)
- **`components/`** — reusable UI components scoped by domain (`todo/`)
- **`lib/`** — shared utilities, API clients, types, validation

## Naming Conventions

- **API files**: `<domain>.<layer>.ts` (e.g., `todos.service.ts`, `auth.repository.ts`)
- **Web components**: PascalCase (e.g., `TodoApp.tsx`, `LoginForm.tsx`)
- **Web pages**: `page.tsx` inside `app/<route>/`
- **Test files**: `<name>.test.ts` inside `_test_/`

## Import Organization

```typescript
// External packages first
import Fastify from "fastify";
// Internal absolute (within package, no alias configured — use relative)
import { TodoController } from "../controllers/todos.controller";
```

No path aliases configured in either package; use relative imports within packages.

## Code Organization Principles

- Auth guard is **server-only**: Next.js middleware calls `/auth/me`; never trust client-side session state
- Route plugins use Fastify encapsulation — `preHandler` hooks added inside a plugin affect only that plugin's routes
- Repositories own all SQL; services own all business rules; controllers own only request/response shaping
