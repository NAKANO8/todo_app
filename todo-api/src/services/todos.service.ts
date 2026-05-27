// services/todos.service.ts
import { TodoRepository } from "../repositories/todos.repository";

export const TodoService = {
  async getAll(userId: number) {
    return TodoRepository.findAll(userId);
  },

  async getById(id: number, userId: number) {
    const todo = await TodoRepository.findById(id, userId);
    if (!todo) throw new Error("NOT_FOUND");
    return todo;
  },

  async create(title: string, userId: number) {
    if (!title || title.length > 100) {
      throw new Error("INVALID_CONTENT");
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

