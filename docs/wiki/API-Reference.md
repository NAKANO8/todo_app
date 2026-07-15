# API Reference

*[日本語版はこちら](API-Reference.ja.md)*

Base URL: `http://localhost:3001` in dev (see [Getting Started](Getting-Started)). All endpoints are on `todo-api` (Fastify). All requests/responses are JSON unless noted.

Session cookie (`sessionId`) is required for every endpoint except `POST /auth/register`, `POST /auth/login`, and `GET /` health checks. Send it with `credentials: "include"` from the browser.

## Auth

| Method & path | Auth | Rate limit | Body | Success | Errors |
|---|---|---|---|---|---|
| `POST /auth/register` | none | 5 / hour / IP | `{ email, password }` | `201 { message }` | `400` invalid/duplicate email |
| `POST /auth/login` | none | 10 / 15 min / IP | `{ email, password }` | `200 { message }`, sets `sessionId` cookie | `401` invalid credentials, `403` account disabled |
| `POST /auth/logout` | session | global only | — | `200 { message }`, clears cookie | — (always 200, even if not logged in) |
| `GET /auth/me` | session | global only | — | `200 { id, email, role }` | `401` unauthorized |

## Todos

All todo endpoints are scoped to the authenticated user (`req.session.userId`) — you can never see or mutate another user's todos (see [Todo Management](Todo-Management#per-user-data-isolation)).

| Method & path | Body | Success | Errors |
|---|---|---|---|
| `GET /todos` | — | `200 [Todo, ...]` | `401` no session |
| `GET /todos/:id` | — | `200 Todo` | `401`, `404` not found / not yours |
| `POST /todos` | `{ title }` (1–100 chars) | `201 { message }` | `400` invalid body, `401` |
| `PATCH /todos/:id` | `{ title? , status? }` (at least one; `status` is `0` or `1`) | `200 { message }` | `400`, `401`, `404` |
| `DELETE /todos/:id` | — | `200 { message }` | `401`, `404` |

`Todo` shape: `{ id, title, status, created_at, updated_at }` — see [Database Schema](Database-Schema).

## Admin — user management

All `/admin/*` routes require an authenticated **admin** session (`adminOnlyGuard` — see [Admin & User Management](Admin-User-Management#authorization-adminonlyguard)).

| Method & path | Body | Success | Errors |
|---|---|---|---|
| `GET /admin/users` | — | `200 [User, ...]` | `401`, `403` non-admin |
| `PATCH /admin/users/:userId/role` | `{ role: "admin" \| "member" }` | `200 { message: "role updated" }` | `401`, `403`, `404` no such user, `409` would leave zero active admins |
| `PATCH /admin/users/:userId/status` | `{ status: "active" \| "disabled" }` | `200 { invalidatedCount }` | `401`, `403`, `404`, `409` |
| `DELETE /admin/sessions/:userId` | — | `200 { invalidatedCount }` | `401`, `403` |

`User` shape: `{ id, email, role, status }` — no `password_hash`, ever.

See [Admin & User Management](Admin-User-Management) for what `invalidatedCount` and the `409` invariant actually mean.

## Validation rules

JSON Schema is applied on the Fastify route (`schema.body` / `schema.params`), so invalid requests are rejected with `400` **before** any handler or business logic runs.

| Field | Rule |
|---|---|
| `email` | AJV `format: "email"`, max 255 chars |
| `password` | 8–128 chars, must contain at least one uppercase letter and one digit — pattern `^(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$` |
| `todos.title` | 1–100 chars |
| `todos.status` | integer, `0` or `1` |
| `role` | enum `admin` \| `member` |
| `status` (account) | enum `active` \| `disabled` |

Every request body schema sets `additionalProperties: false`. Combined with Fastify 5's default AJV `removeAdditional: true`, unexpected fields are **stripped silently, not rejected** — a `400` will not tell you "unknown field," the field is just gone by the time the handler sees it. See the register-role-smuggling note in [Authentication & Sessions](Authentication-and-Sessions#register) for why this matters.

## Error shape

All error responses are `{ "message": string }`. Application-level errors (`AppError`) carry their own `statusCode`; anything unexpected is logged server-side and returned as `500 { message: "Internal Server Error" }` — internal error details are never leaked to the client.

## Rate limiting

`@fastify/rate-limit`, keyed by IP (`req.ip`):

| Scope | Limit |
|---|---|
| Global (every route) | 200 requests / minute |
| `POST /auth/login` | 10 requests / 15 minutes |
| `POST /auth/register` | 5 requests / hour |

Exceeding a limit returns `429`.

## CORS

Configured in `app.ts`: only `process.env.CORS_ORIGIN` (defaults to `http://localhost:3000`) may call the API with credentials. Methods allowed: `GET, POST, PATCH, DELETE, OPTIONS`.
