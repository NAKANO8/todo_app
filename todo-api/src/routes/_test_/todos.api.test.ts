import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { app } from "../../app";
import { pool } from "../../db/client";

beforeAll(async () => {
  await app.ready();
});

beforeEach(async () => {
  await pool.query("DELETE FROM todos");
});

afterAll(async () => {
  await pool.end();
});

describe("Todos API", () => {
  it("POST /todos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "api test" },
    });

    expect(res.statusCode).toBe(201);
  });

  it("GET /todos", async () => {
    await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "api test" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/todos",
    });

    const data = res.json();
    expect(data.length).toBe(1);
    expect(data[0].title).toBe("api test");
    expect(data[0].status).toBe(0);
  });

  it("PATCH /todos/:id", async () => {
    await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "old" },
    });

    const list = await app.inject({ method: "GET", url: "/todos" });
    const id = list.json()[0].id;

    const res = await app.inject({
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { status: 1 },
    });

    expect(res.statusCode).toBe(200);
  });

  it("DELETE /todos/:id", async () => {
    await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "delete" },
    });

    const list = await app.inject({ method: "GET", url: "/todos" });
    const id = list.json()[0].id;

    await app.inject({ method: "DELETE", url: `/todos/${id}` });

    const res = await app.inject({ method: "GET", url: "/todos" });
    expect(res.json().length).toBe(0);
  });
});

