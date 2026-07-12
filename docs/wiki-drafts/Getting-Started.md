# Getting Started

*[日本語版はこちら](Getting-Started.ja.md)*

How to get the full stack (API + web + MySQL + Redis) running locally.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/installation) v11 — `npm install -g pnpm`
- [Docker](https://docs.docker.com/engine/install/) v29+

## 1. Clone and configure

```bash
git clone https://github.com/NAKANO8/todo_app.git
cd todo_app
cp todo-api/.env.dev.example todo-api/.env.dev
```

Edit `todo-api/.env.dev` and set real values for the secrets — the example file ships with blank passwords:

| Variable | Purpose |
|---|---|
| `DB_PASSWORD` / `MYSQL_PASSWORD` | MySQL app-user password |
| `MYSQL_ROOT_PASSWORD` | MySQL root password (container init only) |
| `SESSION_SECRET` | Signs the session cookie — any long random string |
| `REDIS_HOST` / `REDIS_PORT` | Defaults to the `redis` service / `6379`; only change if you're not using the bundled Docker Redis |

## 2. Start the stack

```bash
pnpm docker:dev-init   # first run — builds images, starts API + web + MySQL + Redis
pnpm docker:dev        # subsequent runs — no rebuild
```

This starts four containers (see [Deployment & Operations](Deployment-and-Operations) for the full compose breakdown):

| Service | Port | Role |
|---|---|---|
| `web` | 3000 | Next.js frontend |
| `api` | 3001 | Fastify REST API |
| `db` | 3306 | MySQL 8.0 — schema loaded once from `mysql/init.sql` |
| `redis` | 6379 | Session store (see [Authentication & Sessions](Authentication-and-Sessions)) |

Open **http://localhost:3000**.

## 3. First-time usage

1. Click **新規登録 (Register)** and create an account
2. Log in with your email and password
3. Add, complete, and delete todos

New accounts are created with `role = member`, `status = active` — see [Admin & User Management](Admin-User-Management) for how to promote the first admin.

## Running tests

```bash
cd todo-api && pnpm test   # Vitest — API only; todo-web has component tests colocated in _test_/ but no CI-wired runner yet
```

## Troubleshooting

**Port already in use** — another process is using 3000/3001/3306/6379. Stop it, or change the port mapping in `docker-compose.dev.yml`.

**Database not connecting on first start** — MySQL takes ~10–20s to initialize; the `api` container waits on its healthcheck (`docker-compose.yml`), so this should self-resolve. If it doesn't, check `docker compose logs db`.

**Schema changes not appearing** — `mysql/init.sql` only runs against an **empty** data volume. If you've already started the `db` container once, edits to `init.sql` won't reapply. Drop the volume (`docker compose down -v`) to force a re-init, or apply the change manually — see [Database Schema](Database-Schema#migration-notes).

**Logged in but redirected to `/login` unexpectedly** — sessions live in Redis with no TTL set at the store level (see [Authentication & Sessions](Authentication-and-Sessions)); if you flushed Redis (`docker compose restart redis` on some configs clears data) your session is gone even though the cookie is still in your browser.

## Source of truth

Setup steps mirror [`docs/README.md`](https://github.com/NAKANO8/todo_app/blob/main/docs/README.md) and [`docs/CONTRIBUTING.md`](https://github.com/NAKANO8/todo_app/blob/main/docs/CONTRIBUTING.md) — if those diverge from this page, the repo docs win; please fix this page to match.
