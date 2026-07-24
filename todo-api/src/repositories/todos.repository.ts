// repositories/todos.repository.ts
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

  async create(title: string, userId: number, status: number = 0): Promise<void> {
    await prisma.todo.create({
      data: {
        title,
        userId,
        status: status === 1,
      },
    });
  },

  async update(
    id: number,
    userId: number,
    data: Partial<Pick<Todo, "title" | "status">>
  ): Promise<void> {
    const prismaData: { title?: string; status?: boolean } = {};

    if (data.title !== undefined) {
      prismaData.title = data.title;
    }

    if (data.status !== undefined) {
      prismaData.status = data.status === 1;
    }

    if (Object.keys(prismaData).length === 0) return;

    await prisma.todo.updateMany({
      where: { id, userId },
      data: prismaData,
    });
  },

  async delete(id: number, userId: number): Promise<void> {
    await prisma.todo.deleteMany({ where: { id, userId } });
  },
};

