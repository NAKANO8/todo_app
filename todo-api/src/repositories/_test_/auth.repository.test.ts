import { describe, it, expect, afterAll } from "vitest";
import { pool } from "../../db/client";
import { AuthRepository } from "../auth.repository";

const TEST_EMAIL = "auth_repo_test@example.com";

afterAll(async () => {
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL]);
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
});
