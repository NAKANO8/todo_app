import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcrypt";
import { buildApp, app } from "../../app";
import { pool } from "../../db/client";

const TEST_EMAIL = "auth_test@example.com";
const TEST_PASSWORD = "Testpassword1";
const ROLE_DEFAULT_TEST_EMAIL = "auth_role_default_test@example.com";
const ROLE_ESCALATION_TEST_EMAIL = "auth_role_escalation_test@example.com";
const PRE_EXISTING_ACCOUNT_EMAIL = "auth_pre_existing_account_test@example.com";
const PRE_EXISTING_ACCOUNT_PASSWORD = "Testpassword1";
const NO_NAME_TEST_EMAIL = "auth_no_name_test@example.com";

beforeAll(async () => {
  await buildApp();
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [ROLE_DEFAULT_TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [ROLE_ESCALATION_TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [PRE_EXISTING_ACCOUNT_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [NO_NAME_TEST_EMAIL]);
});

afterAll(async () => {
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [ROLE_DEFAULT_TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [ROLE_ESCALATION_TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [PRE_EXISTING_ACCOUNT_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [NO_NAME_TEST_EMAIL]);
  await pool.end();
});

describe("Auth API", () => {
  describe("POST /auth/register", () => {
    it("新規ユーザーを登録できる", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD, name: "Auth Test User" },
      });
      expect(res.statusCode).toBe(201);
    });

    it("重複メールアドレスで登録すると 400 を返す", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD, name: "Auth Test User" },
      });
      expect(res.statusCode).toBe(400);
    });

    // Requirement 3.1/3.2: name は登録時の必須項目であり、未入力の登録要求は拒否される
    it("nameを含めずに登録すると 400 を返す", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: NO_NAME_TEST_EMAIL, password: TEST_PASSWORD },
      });
      expect(res.statusCode).toBe(400);
    });

    // NOTE: /auth/register は既存の config: { rateLimit: { max: 5, timeWindow: "1 hour" } }
    // を持つため、この describe 内で消費する register 呼び出し回数を厳密に抑えている
    // (このファイルでは5回: 登録成功1・重複登録1・name未指定1・ROLE_DEFAULT 1・ROLE_ESCALATION 1)。
    // 1〜50文字の境界値検証(空文字/51文字/50文字ちょうど)は専用のレート制限バケットを持つ
    // auth.register.name.api.test.ts に分離してある。

    it("新規登録したユーザーは member ロールでログインでき、/auth/me のロールが member になり、登録時に指定したnameが保存されている", async () => {
      const registerRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: ROLE_DEFAULT_TEST_EMAIL, password: TEST_PASSWORD, name: "Role Default User" },
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
      const body = meRes.json();
      expect(body).toMatchObject({ email: ROLE_DEFAULT_TEST_EMAIL, role: "member" });
      // Requirement 3.1: 登録時にクライアントが指定したnameがそのまま保存されている
      // (email のローカル部からの導出ではない)
      expect(body.name).toBe("Role Default User");
    });

    it("登録リクエストに role を含めても無視され、登録は member ロールで成功する", async () => {
      const registerRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: ROLE_ESCALATION_TEST_EMAIL, password: TEST_PASSWORD, name: "Role Escalation User", role: "admin" },
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

  describe("導入前から存在するアカウントの継続利用", () => {
    it("role を指定せずに直接挿入されたアカウントは既定の member ロールを持ち、ログインおよび /auth/me が引き続き成功する", async () => {
      const password_hash = await bcrypt.hash(PRE_EXISTING_ACCOUNT_PASSWORD, 10);
      // Simulates a row already backfilled by the Requirement 4.1 migration
      // (name = local part of email), since `name` is NOT NULL and this
      // bypasses AuthRepository.createUser entirely.
      await (pool as any).query(
        "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
        [PRE_EXISTING_ACCOUNT_EMAIL, password_hash, PRE_EXISTING_ACCOUNT_EMAIL.split("@")[0]]
      );

      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: PRE_EXISTING_ACCOUNT_EMAIL, password: PRE_EXISTING_ACCOUNT_PASSWORD },
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
      expect(meRes.json()).toMatchObject({ email: PRE_EXISTING_ACCOUNT_EMAIL, role: "member" });
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

    // Requirement 3.1: ログイン用スキーマは登録用スキーマとは分離されており、
    // name を送らなくてもログインは成功する(nameは登録専用の必須項目)
    it("nameを含めずにログインしても 200 を返す(ログインはnameを要求しない)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      expect(res.statusCode).toBe(200);
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
      const body = res.json();
      // Requirement 1.1: 認証済みユーザーは自分の name を取得できる
      expect(body).toMatchObject({ email: TEST_EMAIL, role: "member" });
      expect(typeof body.name).toBe("string");
      expect(body.name.length).toBeGreaterThan(0);
      // password_hash は決してレスポンスに含めない
      expect(body).not.toHaveProperty("password_hash");
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
