import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp, app } from "../../app";
import { pool } from "../../db/client";

let sessionCookie: string;

beforeAll(async () => {
  await buildApp();

  await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "api_test@example.com", password: "testpassword" },
  });

  const loginRes = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "api_test@example.com", password: "testpassword" },
  });

  const setCookie = loginRes.headers["set-cookie"];
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  sessionCookie = cookieStr?.split(";")[0] ?? "";
});

beforeEach(async () => {
  await (pool as any).query("DELETE FROM todos");
});

afterAll(async () => {
  await (pool as any).query("DELETE FROM users WHERE email = 'api_test@example.com'");
  await pool.end();
});

describe("Todos API", () => {
  it("POST /todos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "api test" },
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(201);
  });

  it("GET /todos", async () => {
    await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "api test" },
      headers: { cookie: sessionCookie },
    });

    const res = await app.inject({
      method: "GET",
      url: "/todos",
      headers: { cookie: sessionCookie },
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
      headers: { cookie: sessionCookie },
    });

    const list = await app.inject({
      method: "GET",
      url: "/todos",
      headers: { cookie: sessionCookie },
    });
    const id = list.json()[0].id;

    const res = await app.inject({
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { status: 1 },
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
  });

  it("DELETE /todos/:id", async () => {
    await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "delete" },
      headers: { cookie: sessionCookie },
    });

    const list = await app.inject({
      method: "GET",
      url: "/todos",
      headers: { cookie: sessionCookie },
    });
    const id = list.json()[0].id;

    await app.inject({
      method: "DELETE",
      url: `/todos/${id}`,
      headers: { cookie: sessionCookie },
    });

    const res = await app.inject({
      method: "GET",
      url: "/todos",
      headers: { cookie: sessionCookie },
    });
    expect(res.json().length).toBe(0);
  });
});
