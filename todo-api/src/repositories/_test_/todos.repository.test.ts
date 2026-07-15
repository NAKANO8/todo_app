import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import { pool } from "../../db/client";
import { TodoRepository } from "../todos.repository";

let testUserId: number;

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result]: [any, any] = await (pool as any).query(
    "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
    ["repo_test@example.com", "hashedpassword", "repo_test"]
  );
  testUserId = result.insertId;
});

beforeEach(async () => {
  await (pool as any).query("DELETE FROM todos WHERE user_id = ?", [testUserId]);
});

afterAll(async () => {
  await (pool as any).query("DELETE FROM users WHERE id = ?", [testUserId]);
  await pool.end();
});

describe("TodoRepository", () => {
  it("create → findAll", async () => {
    await TodoRepository.create("repo test", testUserId);

    const todos = await TodoRepository.findAll(testUserId);
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe("repo test");
  });

  it("findById", async () => {
    await TodoRepository.create("find me", testUserId);

    const todos = await TodoRepository.findAll(testUserId);
    const todo = await TodoRepository.findById(todos[0].id, testUserId);

    expect(todo?.title).toBe("find me");
  });

  it("update", async () => {
    await TodoRepository.create("old", testUserId);
    const [todo] = await TodoRepository.findAll(testUserId);

    await TodoRepository.update(todo.id, testUserId, { title: "new" });
    const updated = await TodoRepository.findById(todo.id, testUserId);

    expect(updated?.title).toBe("new");
  });

  it("delete", async () => {
    await TodoRepository.create("delete me", testUserId);
    const [todo] = await TodoRepository.findAll(testUserId);

    await TodoRepository.delete(todo.id, testUserId);
    const result = await TodoRepository.findAll(testUserId);

    expect(result.length).toBe(0);
  });
});
