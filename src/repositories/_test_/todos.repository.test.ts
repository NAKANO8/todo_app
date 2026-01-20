import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { pool } from "../../db/client";
import { TodoRepository } from "../todos.repository";

beforeAll(async () => {
  await pool.query("DELETE FROM todos");
});

beforeEach(async () => {
  await pool.query("DELETE FROM todos");
});

afterAll(async () => {
  await pool.end();
});

describe("TodoRepository", () => {
  it("create → findAll", async () => {
    await TodoRepository.create("repo test", 0);

    const todos = await TodoRepository.findAll();
    expect(todos.length).toBe(1);
    expect(todos[0].content).toBe("repo test");
  });

  it("findById", async () => {
    await TodoRepository.create("find me", 0);

    const todos = await TodoRepository.findAll();
    const todo = await TodoRepository.findById(todos[0].id);

    expect(todo?.content).toBe("find me");
  });

  it("update", async () => {
    await TodoRepository.create("old", 0);
    const [todo] = await TodoRepository.findAll();

    await TodoRepository.update(todo.id, { content: "new" });
    const updated = await TodoRepository.findById(todo.id);

    expect(updated?.content).toBe("new");
  });

  it("delete", async () => {
    await TodoRepository.create("delete me", 0);
    const [todo] = await TodoRepository.findAll();

    await TodoRepository.delete(todo.id);
    const result = await TodoRepository.findAll();

    expect(result.length).toBe(0);
  });
});

