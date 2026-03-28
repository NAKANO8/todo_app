// services/todos.service.ts
import { TodoRepository } from "../repositories/todos.repository";

export const TodoService = {
  async getAll() {
    return TodoRepository.findAll();
  },

  async getById(id: number) {
    const todo = await TodoRepository.findById(id);
    if (!todo) throw new Error("NOT_FOUND");
    return todo;
  },

  async create(content: string) {
    if (!content || content.length > 100) {
      throw new Error("INVALID_CONTENT");
    }
    await TodoRepository.create(content, 0);
  },

  async update(id: number, data: { content?: string; status?: number }) {
    await this.getById(id); // 存在確認
    await TodoRepository.update(id, data);
  },

  async delete(id: number) {
    await this.getById(id);
    await TodoRepository.delete(id);
  }
};

