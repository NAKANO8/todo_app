# Todo Management

*[日本語版はこちら](Todo-Management.ja.md)*

## For users

Once logged in, you land on `/todos`:

1. Type a title in the input field and click **追加 (Add)** to create a todo
2. Click the checkbox to mark a todo complete/incomplete
3. Click delete to remove a todo permanently (no undo)

Every todo belongs to exactly one account — there is no sharing or collaboration between users.

## For developers

All endpoints live under `todo-api/src/routes/todos.route.ts` → `todos.controller.ts` → `todos.service.ts` → `todos.repository.ts`.

### Per-user data isolation

Every query is scoped by `userId` **at the repository layer**, not filtered afterward:

```sql
SELECT * FROM todos WHERE user_id = ? AND id = ?
```

`TodoService.getById` (and, by extension, `update`/`delete`, which both call `getById` first) throws `404 Todo not found` — not `403 Forbidden` — if the todo exists but belongs to someone else. This is intentional: it avoids confirming to a caller that a given todo ID exists at all if it isn't theirs.

`req.session.userId` is asserted non-null with `!` in the controller because a `preHandler` hook registered directly on `todoRoutes` (not the shared `adminOnlyGuard` — todos have their own inline guard) already rejects with `401` before any handler runs if there's no session.

### Validation

JSON Schema on the route ([`todos.route.ts`](https://github.com/NAKANO8/todo_app/blob/main/todo-api/src/routes/todos.route.ts)):

| Rule | Create | Update |
|---|---|---|
| `title` | required, 1–100 chars | optional, 1–100 chars |
| `status` | n/a | optional, must be `0` or `1` |
| Unknown fields | rejected (`additionalProperties: false`) | rejected |
| Empty body | n/a | rejected — update requires `minProperties: 1` |

`status` is a `BOOLEAN` column in MySQL (`0` = incomplete, `1` = complete) surfaced as a plain integer in the API — there's no separate "archived"/"in-progress" state.

### Why `getById` runs before every mutation

`update` and `delete` both call `TodoService.getById(id, userId)` first, purely to produce a `404` when the target either doesn't exist or belongs to another user, before attempting the SQL `UPDATE`/`DELETE` (which would otherwise just silently affect zero rows). This costs an extra query per mutation but keeps error semantics consistent with `getById`'s own 404 behavior.
