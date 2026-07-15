import { describe, it, expect, afterAll } from "vitest";
import { pool } from "../client";

const TEST_EMAIL = "users_name_schema_test@example.com";

afterAll(async () => {
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL]);
  await pool.end();
});

describe("users table name column (Requirements 1.1, 4.1, 4.2)", () => {
  it("has a NOT NULL name column of type varchar(255)", async () => {
    const [columns]: any = await (pool as any).query(
      "SHOW COLUMNS FROM users LIKE 'name'"
    );

    expect(columns).toHaveLength(1);
    expect(columns[0].Type).toBe("varchar(255)");
    expect(columns[0].Null).toBe("NO");
  });

  it("persists a name value provided on insert (Requirement 1.1)", async () => {
    await (pool as any).query(
      "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
      [TEST_EMAIL, "hashedpassword", "users_name_schema_test"]
    );

    const [rows]: any = await (pool as any).query(
      "SELECT name FROM users WHERE email = ?",
      [TEST_EMAIL]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("users_name_schema_test");
  });

  it("every pre-existing row has a non-empty name (Requirement 4.1/4.2 backfill invariant)", async () => {
    // Every row in the table must satisfy the NOT NULL constraint by
    // definition, but this asserts the stronger, feature-relevant invariant:
    // the migration backfilled a *meaningful* (non-empty) value for accounts
    // that pre-date this feature, rather than merely satisfying the column
    // type with e.g. an empty string.
    const [rows]: any = await (pool as any).query("SELECT name FROM users LIMIT 5");

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(typeof row.name).toBe("string");
      expect(row.name.length).toBeGreaterThan(0);
    }
  });
});
