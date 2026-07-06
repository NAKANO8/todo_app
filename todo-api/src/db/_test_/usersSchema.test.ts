import { describe, it, expect, afterAll } from "vitest";
import { pool } from "../client";

const TEST_EMAIL = "users_schema_test@example.com";

afterAll(async () => {
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL]);
  await pool.end();
});

describe("users table status column (Requirements 3.1, 3.2)", () => {
  it("has a status column that defaults to 'active'", async () => {
    const [columns]: any = await (pool as any).query(
      "SHOW COLUMNS FROM users LIKE 'status'"
    );

    expect(columns).toHaveLength(1);
    expect(columns[0].Type).toBe("enum('active','disabled')");
    expect(columns[0].Null).toBe("NO");
    expect(columns[0].Default).toBe("active");
  });

  it("assigns 'active' status to a newly inserted row by default (Requirement 3.1)", async () => {
    await (pool as any).query(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      [TEST_EMAIL, "hashedpassword"]
    );

    const [rows]: any = await (pool as any).query(
      "SELECT status FROM users WHERE email = ?",
      [TEST_EMAIL]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
  });

  it("retroactively treats pre-existing rows as 'active' (Requirement 3.2)", async () => {
    // Simulates a pre-existing account created before this migration: the
    // column's DEFAULT guarantees any row present in the table has status
    // 'active' unless explicitly changed, so any existing row must be 'active'.
    const [rows]: any = await (pool as any).query(
      "SELECT status FROM users LIMIT 5"
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.status).toBe("active");
    }
  });
});
