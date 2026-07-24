// repositories/todos.repository.ts
import { pool } from "../db/client";
import { prisma } from "../db/prismaClient";
import { Todo } from "../types/todo";
import type { TodoModel } from "../generated/prisma/models/Todo";

// Prisma's `Todo` model uses camelCase scalar names (userId/createdAt/updatedAt)
// and maps the `status` column to a JS boolean. The public `Todo` type keeps the
// pre-existing mysql2-era snake_case shape with `status` as 0/1, so callers
// (TodoService, routes) don't need to change. This mapper bridges the two.
function toTodo(row: TodoModel): Todo {
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    status: row.status ? 1 : 0,
    created_at: row.createdAt as unknown as string,
    updated_at: row.updatedAt as unknown as string,
  };
}

export const TodoRepository = {
  async findAll(userId: number): Promise<Todo[]> {
    const rows = await prisma.todo.findMany({ where: { userId } });
    return rows.map(toTodo);
  },

  async findById(id: number, userId: number): Promise<Todo | null> {
    const row = await prisma.todo.findFirst({ where: { id, userId } });
    return row ? toTodo(row) : null;
  },

  async create(title: string, userId: number, status: number = 0) {
    await pool.query(
      `INSERT INTO todos (title, user_id, status, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [title, userId, status]
    );
  },

  async update(
    id: number,
    userId: number,
    data: Partial<Pick<Todo, "title" | "status">>
  ) {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.title !== undefined) {
      fields.push("title = ?");
      values.push(data.title);
    }

    if (data.status !== undefined) {
      fields.push("status = ?");
      values.push(data.status);
    }

    if (fields.length === 0) return;

    values.push(id, userId);

    const sql = `
      UPDATE todos SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = ? AND user_id = ?
    `;

    await pool.query(sql, values);
  },

  async delete(id: number, userId: number) {
    await pool.query(
      "DELETE FROM todos WHERE id = ? AND user_id = ?",
      [id, userId]
    );
  },
};

