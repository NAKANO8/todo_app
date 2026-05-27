// repositories/todos.repository.ts
import { pool } from "../db/client";
import { Todo } from "../types/todo";

export const TodoRepository = {
  async findAll(userId: number): Promise<Todo[]> {
    const [rows] = await pool.query(
      "SELECT * FROM todos WHERE user_id = ?",
      [userId]
    );
    return rows as Todo[];
  },

  async findById(id: number, userId: number): Promise<Todo | null> {
    const [rows] = await pool.query(
      "SELECT * FROM todos WHERE id = ? AND user_id = ?",
      [id, userId]
    );
    return (rows as Todo[])[0] ?? null;
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

