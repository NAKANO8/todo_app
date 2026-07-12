# Todo App Wiki

*[日本語版はこちら](Home.ja.md)*

This wiki documents **how the Todo App actually works** — for people using the app, and for developers building on it. Unlike the [README](https://github.com/NAKANO8/todo_app/blob/main/docs/README.md) (which covers *setup*), this wiki focuses on *behavior*: request flows, invariants, and the reasoning behind non-obvious decisions.

Todo App is a full-stack Todo application (Fastify API + Next.js frontend) built to practice production-quality patterns — session auth, layered architecture, role-based admin controls — in a small, understandable codebase.

## Pages

| Page | For | What it covers |
|---|---|---|
| [Getting Started](Getting-Started) | Developers | Local setup, environment variables, running the stack |
| [Architecture](Architecture) | Developers | Monorepo layout, layered request flow, key design decisions |
| [Authentication & Sessions](Authentication-and-Sessions) | Users & Developers | Register/login/logout, how sessions are stored and validated, forced session invalidation |
| [Todo Management](Todo-Management) | Users & Developers | Creating/completing/deleting todos, per-user data isolation |
| [Admin & User Management](Admin-User-Management) | Users & Developers | Roles, account status, the "last admin" safety rule, how disabling a user works |
| [API Reference](API-Reference) | Developers | Every endpoint: method, auth requirement, request/response shape, status codes |
| [Database Schema](Database-Schema) | Developers | Tables, relationships, invariants enforced at the SQL level |
| [Deployment & Operations](Deployment-and-Operations) | Developers | Docker Compose (dev/prod), CI/CD pipeline, required secrets |

## Update policy

This project changes at a **medium-to-high** pace. When a page's underlying behavior changes (a new endpoint, a new column, a changed guard), update that page **in the same PR** as the code change — don't let this wiki drift into a historical document. Each page below states which source files it's derived from; if you change those files, check the corresponding page.

## Conventions used across this wiki

- Endpoints are written as `METHOD /path`.
- "Guard" refers to a Fastify `preHandler` hook that runs before a route handler and can short-circuit the request (e.g. `adminOnlyGuard`).
- Code paths are given relative to the repo root (`todo-api/...`, `todo-web/...`).
