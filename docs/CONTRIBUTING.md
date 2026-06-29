# Contributing to Todo App

Thank you for your interest in contributing!
This project is maintained by a single developer on a best-effort basis.

## Ways to Contribute

- **Bug reports** — open a GitHub Issue with steps to reproduce
- **Feature suggestions** — open an Issue to discuss before sending a PR
- **Pull requests** — welcome for bug fixes and small improvements

## Development Setup

### Prerequisites

- Node.js v20 or later
- pnpm v11 — `npm install -g pnpm`
- Docker v29 or later

### Local environment

```bash
git clone https://github.com/NAKANO8/todo_app.git
cd todo_app
cp todo-api/.env.dev.example todo-api/.env.dev
# Edit .env.dev and set DB_PASSWORD, MYSQL_ROOT_PASSWORD, SESSION_SECRET
pnpm docker:dev-init
```

The app will be available at [http://localhost:3000](http://localhost:3000).

After the first run, use `pnpm docker:dev` to start without rebuilding.

### Project structure

```
todo-api/   Fastify 5 API server (TypeScript)
todo-web/   Next.js 16 frontend (TypeScript)
docs/       Documentation and screenshots
mysql/      Database initialization scripts
```

## Submitting a Pull Request

1. Fork the repository and create a branch from `main`
2. Make your changes and confirm the app works with `pnpm docker:dev`
3. Open a PR with a short description of what changed and why

There are no automated CI checks enforced on PRs at this time, so please test locally before submitting.

## Reporting Bugs

Open a GitHub Issue and include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (OS, Docker version, browser if relevant)

## Notes

This is a solo-maintained project. Response times may vary depending on the maintainer's availability.
Progress and status updates for open issues will be shared on the Issue thread itself.
