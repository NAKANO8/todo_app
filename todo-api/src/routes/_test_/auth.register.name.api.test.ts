import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp, app } from "../../app";
import { pool } from "../../db/client";

// Requirement 3.1/3.2/3.3: 登録時の name は 1〜50 文字の範囲で必須。
// 境界値検証はこのファイル専用に切り出してある。/auth/register には
// config: { rateLimit: { max: 5, timeWindow: "1 hour" } } が設定されており、
// auth.api.test.ts と同一ファイル内で register を叩くとレート制限バケットを
// 共有し 429 になってしまうため、専用のレート制限バケット(ファイル単位で
// 独立した app インスタンス)を持つこのファイルに分離している。
const EMPTY_NAME_EMAIL = "auth_empty_name_test@example.com";
const LONG_NAME_EMAIL = "auth_long_name_test@example.com";
const MAX_NAME_EMAIL = "auth_max_name_test@example.com";
const PASSWORD = "Testpassword1";

beforeAll(async () => {
  await buildApp();
  await (pool as any).query("DELETE FROM users WHERE email = ?", [EMPTY_NAME_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [LONG_NAME_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [MAX_NAME_EMAIL]);
});

afterAll(async () => {
  await (pool as any).query("DELETE FROM users WHERE email = ?", [EMPTY_NAME_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [LONG_NAME_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [MAX_NAME_EMAIL]);
  await pool.end();
});

describe("POST /auth/register の name 長さ検証", () => {
  // Requirement 3.2: 空文字のnameも「未入力」として拒否される
  it("nameが空文字の場合 400 を返す", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: EMPTY_NAME_EMAIL, password: PASSWORD, name: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  // Requirement 3.3: 51文字以上のnameは範囲外として拒否される
  it("nameが51文字の場合 400 を返す", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: LONG_NAME_EMAIL, password: PASSWORD, name: "a".repeat(51) },
    });
    expect(res.statusCode).toBe(400);
  });

  // Requirement 3.3: 1〜50文字の範囲内であれば登録は成功する(境界値: 50文字ちょうど)
  it("nameが50文字ちょうどの場合は登録が成功する", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: MAX_NAME_EMAIL, password: PASSWORD, name: "a".repeat(50) },
    });
    expect(res.statusCode).toBe(201);
  });
});
