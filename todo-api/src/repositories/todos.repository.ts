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

  async create(title: string, status: number = 0) {
    await pool.query(
      `INSERT INTO todos (title, status, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [title, status]
    );
  },

  async update(
    id: number,
    data: Partial<Pick<Todo, "title" | "status">>
  ) {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) {
      fields.push("title = ?");
      values.push(data.title);
    }

    if (data.status !== undefined) {
      fields.push("status = ?");
      values.push(data.status);
    }

    if (fields.length === 0) return;

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

