// services/todos.service.ts
import { TodoRepository } from "../repositories/todos.repository";
import { AppError } from "../errors/AppError";

export const TodoService = {
  async getAll(userId: number) {
    return TodoRepository.findAll(userId);
  },

  async getById(id: number, userId: number) {
    const todo = await TodoRepository.findById(id, userId);
    if (!todo) throw new AppError("Todo not found", 404);
    return todo;
  },

  async create(title: string, userId: number) {
    if (!title || title.length > 100) {
      throw new AppError("invalid title", 400);
    }
    await TodoRepository.create(title, userId, 0);
  },

  async update(id: number, userId: number, data: { title?: string; status?: number }) {
    await this.getById(id, userId);
    await TodoRepository.update(id, userId, data);
  },

  async delete(id: number, userId: number) {
    await this.getById(id, userId);
    await TodoRepository.delete(id, userId);
  },
};

