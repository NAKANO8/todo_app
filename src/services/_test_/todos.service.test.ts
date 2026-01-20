import { describe, it, expect, vi, beforeEach } from "vitest";
import { TodoService } from "../todos.service";
import { TodoRepository } from "../../repositories/todos.repository";

// Repositoryをモック
vi.mock("../../repositories/todos.repository", () => ({
  TodoRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("TodoService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("空文字はエラーになる", async () => {
    await expect(
      TodoService.create("")
    ).rejects.toThrow();
  });

  it("100文字超はエラーになる", async () => {
    await expect(
      TodoService.create("a".repeat(101))
    ).rejects.toThrow();
  });

  it("正常ならRepository.createが呼ばれる", async () => {
    await TodoService.create("test todo");

    expect(TodoRepository.create).toHaveBeenCalledWith("test todo", 0);
  });
});

