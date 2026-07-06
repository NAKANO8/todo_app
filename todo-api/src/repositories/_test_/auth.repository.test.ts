import { describe, it, expect, afterAll } from "vitest";
import { pool } from "../../db/client";
import { AuthRepository } from "../auth.repository";

const TEST_EMAIL = "auth_repo_test@example.com";
const TEST_EMAIL_FINDALL = "auth_repo_test_findall@example.com";

afterAll(async () => {
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL_FINDALL]);
  await pool.end();
});

describe("AuthRepository", () => {
  it("findById が既存アカウントの role を含めて返す", async () => {
    await AuthRepository.createUser({
      email: TEST_EMAIL,
      password_hash: "hashedpassword",
    });

    const created = await AuthRepository.findByEmail(TEST_EMAIL);
    expect(created).not.toBeNull();

    const found = await AuthRepository.findById(created!.id);

    expect(found).not.toBeNull();
    expect(found!.role).toBe("member");
  });

  it("findById が既存アカウントの status を含めて返す（既定値 active）", async () => {
    const created = await AuthRepository.findByEmail(TEST_EMAIL);
    expect(created).not.toBeNull();

    const found = await AuthRepository.findById(created!.id);

    expect(found).not.toBeNull();
    expect(found!.status).toBe("active");
  });

  it("findAll がパスワードハッシュを含まず、role・status付きで全ユーザーを返す", async () => {
    await AuthRepository.createUser({
      email: TEST_EMAIL_FINDALL,
      password_hash: "hashedpassword",
    });
    const created = await AuthRepository.findByEmail(TEST_EMAIL_FINDALL);
    expect(created).not.toBeNull();

    const all = await AuthRepository.findAll();

    // 全ユーザーが対象（グループ等での絞り込みをしていないこと）
    expect(all.length).toBeGreaterThanOrEqual(2);

    const target = all.find((u) => u.id === created!.id);
    expect(target).toBeDefined();
    expect(target!.email).toBe(TEST_EMAIL_FINDALL);
    expect(target!.role).toBe("member");
    expect(target!.status).toBe("active");
    expect(target).not.toHaveProperty("password_hash");
  });
});
