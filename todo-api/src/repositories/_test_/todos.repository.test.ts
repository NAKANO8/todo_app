import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "../../db/prismaClient";
import { TodoRepository } from "../todos.repository";

let testUserId: number;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: "repo_test@example.com",
      passwordHash: "hashedpassword",
      name: "repo_test",
    },
  });
  testUserId = user.id;
});

beforeEach(async () => {
  await prisma.todo.deleteMany({ where: { userId: testUserId } });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: testUserId } });
  await prisma.$disconnect();
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

  it("findById returns null for another user's todo (user_id scope enforced)", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: "repo_test_other@example.com",
        passwordHash: "hashedpassword",
        name: "repo_test_other",
      },
    });
    const otherUserId = otherUser.id;

    try {
      await TodoRepository.create("mine only", testUserId);
      const [todo] = await TodoRepository.findAll(testUserId);

      const result = await TodoRepository.findById(todo.id, otherUserId);

      expect(result).toBeNull();
    } finally {
      await prisma.user.delete({ where: { id: otherUserId } });
    }
  });

  it("update", async () => {
    await TodoRepository.create("old", testUserId);
    const [todo] = await TodoRepository.findAll(testUserId);

    await TodoRepository.update(todo.id, testUserId, { title: "new" });
    const updated = await TodoRepository.findById(todo.id, testUserId);

    expect(updated?.title).toBe("new");
  });

  it("update with no fields specified does not issue a DB write query", async () => {
    await TodoRepository.create("untouched", testUserId);
    const [todo] = await TodoRepository.findAll(testUserId);

    const updateManySpy = vi.spyOn(prisma.todo, "updateMany");

    await TodoRepository.update(todo.id, testUserId, {});

    expect(updateManySpy).not.toHaveBeenCalled();

    updateManySpy.mockRestore();
  });

  it("update does not affect another user's todo (user_id scope enforced)", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: "repo_test_other_update@example.com",
        passwordHash: "hashedpassword",
        name: "repo_test_other_update",
      },
    });
    const otherUserId = otherUser.id;

    try {
      await TodoRepository.create("owner's todo", testUserId);
      const [todo] = await TodoRepository.findAll(testUserId);

      await TodoRepository.update(todo.id, otherUserId, { title: "hijacked" });
      const unchanged = await TodoRepository.findById(todo.id, testUserId);

      expect(unchanged?.title).toBe("owner's todo");
    } finally {
      await prisma.user.delete({ where: { id: otherUserId } });
    }
  });

  it("delete does not affect another user's todo (user_id scope enforced)", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: "repo_test_other_delete@example.com",
        passwordHash: "hashedpassword",
        name: "repo_test_other_delete",
      },
    });
    const otherUserId = otherUser.id;

    try {
      await TodoRepository.create("keep me", testUserId);
      const [todo] = await TodoRepository.findAll(testUserId);

      await TodoRepository.delete(todo.id, otherUserId);
      const stillThere = await TodoRepository.findById(todo.id, testUserId);

      expect(stillThere).not.toBeNull();
    } finally {
      await prisma.user.delete({ where: { id: otherUserId } });
    }
  });

  it("delete", async () => {
    await TodoRepository.create("delete me", testUserId);
    const [todo] = await TodoRepository.findAll(testUserId);

    await TodoRepository.delete(todo.id, testUserId);
    const result = await TodoRepository.findAll(testUserId);

    expect(result.length).toBe(0);
  });
});
