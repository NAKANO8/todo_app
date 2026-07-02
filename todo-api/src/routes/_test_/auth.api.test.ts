import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp, app } from "../../app";
import { pool } from "../../db/client";

const TEST_EMAIL = "auth_test@example.com";
const TEST_PASSWORD = "Testpassword1";
const ROLE_DEFAULT_TEST_EMAIL = "auth_role_default_test@example.com";
const ROLE_ESCALATION_TEST_EMAIL = "auth_role_escalation_test@example.com";

beforeAll(async () => {
  await buildApp();
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [ROLE_DEFAULT_TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [ROLE_ESCALATION_TEST_EMAIL]);
});

afterAll(async () => {
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [ROLE_DEFAULT_TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [ROLE_ESCALATION_TEST_EMAIL]);
  await pool.end();
});

describe("Auth API", () => {
  describe("POST /auth/register", () => {
    it("新規ユーザーを登録できる", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      expect(res.statusCode).toBe(201);
    });

    it("重複メールアドレスで登録すると 400 を返す", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      expect(res.statusCode).toBe(400);
    });

    it("新規登録したユーザーは member ロールでログインでき、/auth/me のロールが member になる", async () => {
      const registerRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: ROLE_DEFAULT_TEST_EMAIL, password: TEST_PASSWORD },
      });
      expect(registerRes.statusCode).toBe(201);

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: ROLE_DEFAULT_TEST_EMAIL, password: TEST_PASSWORD },
      });
      expect(loginRes.statusCode).toBe(200);
      const setCookie = loginRes.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const sessionCookie = cookieStr?.split(";")[0] ?? "";

      const meRes = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: sessionCookie },
      });

      expect(meRes.statusCode).toBe(200);
      expect(meRes.json()).toMatchObject({ email: ROLE_DEFAULT_TEST_EMAIL, role: "member" });
    });

    it("登録リクエストに role を含めても無視され、登録は member ロールで成功する", async () => {
      const registerRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: ROLE_ESCALATION_TEST_EMAIL, password: TEST_PASSWORD, role: "admin" },
      });
      expect(registerRes.statusCode).toBe(201);

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: ROLE_ESCALATION_TEST_EMAIL, password: TEST_PASSWORD },
      });
      expect(loginRes.statusCode).toBe(200);
      const setCookie = loginRes.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const sessionCookie = cookieStr?.split(";")[0] ?? "";

      const meRes = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: sessionCookie },
      });

      expect(meRes.statusCode).toBe(200);
      expect(meRes.json()).toMatchObject({ email: ROLE_ESCALATION_TEST_EMAIL, role: "member" });
    });
  });

  describe("POST /auth/login", () => {
    it("正しい認証情報でログインすると 200 と Set-Cookie を返す", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(200);

      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();
    });

    it("誤ったパスワードでログインすると 401 を返す", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: "Wrongpassword1" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /auth/me", () => {
    it("未認証の場合 401 を返す", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
      });
      expect(res.statusCode).toBe(401);
    });

    it("ログイン後は 200 とユーザー情報を返す", async () => {
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      const setCookie = loginRes.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const sessionCookie = cookieStr?.split(";")[0] ?? "";

      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: sessionCookie },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ email: TEST_EMAIL, role: "member" });
    });
  });

  describe("POST /auth/logout", () => {
    it("ログアウト後は /auth/me が 401 を返す", async () => {
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      const setCookie = loginRes.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const sessionCookie = cookieStr?.split(";")[0] ?? "";

      await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { cookie: sessionCookie },
      });

      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
