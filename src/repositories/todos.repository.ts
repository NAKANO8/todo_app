// repositories/todos.repository.ts
import { pool } from "../db/client";
import { Todo } from "../types/todo";

export const TodoRepository = {
  async findAll(): Promise<Todo[]> {
    const [rows] = await pool.query("SELECT * FROM todos");
    return rows as Todo[];
  },

  async findById(id: number): Promise<Todo | null> {
    const [rows] = await pool.query(
      "SELECT * FROM todos WHERE id = ?",
      [id]
    );
    return (rows as Todo[])[0] ?? null;
  },

  async create(content: string, status: number) {
    await pool.query(
      `INSERT INTO todos (content, status, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [content, status]
    );
  },

  async update(id: number, data: Partial<Pick<Todo, "content" | "status">>) {
    const fields = [];
    const values = [];

    if (data.content !== undefined) {
      fields.push("content = ?");
      values.push(data.content);
    }

    if (data.status !== undefined) {
      fields.push("status = ?");
      values.push(data.status);
    }

    values.push(id);

    const sql = `
      UPDATE todos SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = ?
    `;

    await pool.query(sql, values);
  },

  async delete(id: number) {
    await pool.query("DELETE FROM todos WHERE id = ?", [id]);
  }
};

