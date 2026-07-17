import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../client";

// This test verifies the exact backfill computation defined in design.md's
// "Migration Strategy" section:
//
//   UPDATE users SET name = SUBSTRING_INDEX(email, '@', 1) WHERE name IS NULL;
//
// It intentionally does NOT touch the shared `users` table (which is already
// migrated to `name VARCHAR(255) NOT NULL` by task 1.1 and is asserted on
// concurrently by usersNameSchema.test.ts under vitest's parallel pool).
// Instead it exercises the identical SQL expression against a throwaway,
// uniquely-named scratch table shaped like step 1-2 of the migration
// (nullable `name`), proving the computed value equals the email's local
// part -- the literal Observable for task 5.3 (Requirements 4.1, 4.2).
const SCRATCH_TABLE = "_test_users_name_backfill_scratch";

// Representative email shapes a real account in this app could have, per
// the AJV `format: "email"` validation used on /auth/register and
// /auth/login (todo-api/src/routes/auth.route.ts).
const CASES: Array<{ email: string }> = [
  { email: "alice@example.com" },
  { email: "bob.smith@example.co.jp" },
  { email: "user+tag@example.com" },
  { email: "first.last+filter@sub.example.com" },
  { email: "UPPER.Case@Example.COM" },
];

describe("users.name backfill computation (Requirements 4.1, 4.2)", () => {
  beforeAll(async () => {
    await (pool as any).query(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`);
    await (pool as any).query(`
      CREATE TABLE ${SCRATCH_TABLE} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255) NULL
      )
    `);
    await (pool as any).query(
      `INSERT INTO ${SCRATCH_TABLE} (email, name) VALUES ${CASES.map(() => "(?, NULL)").join(", ")}`,
      CASES.map((c) => c.email)
    );
  });

  afterAll(async () => {
    await (pool as any).query(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`);
    await pool.end();
  });

  it("sets name to the email's local part for every pre-existing (name IS NULL) row", async () => {
    // The exact backfill statement from design.md's Migration Strategy, step 2.
    await (pool as any).query(
      `UPDATE ${SCRATCH_TABLE} SET name = SUBSTRING_INDEX(email, '@', 1) WHERE name IS NULL`
    );

    const [rows]: any = await (pool as any).query(
      `SELECT email, name FROM ${SCRATCH_TABLE} ORDER BY id`
    );

    expect(rows).toHaveLength(CASES.length);
    for (const row of rows) {
      const expectedLocalPart = row.email.split("@")[0];
      expect(row.name).toBe(expectedLocalPart);
    }
  });

  it("does not overwrite a name that was already set (WHERE name IS NULL guard)", async () => {
    await (pool as any).query(
      `UPDATE ${SCRATCH_TABLE} SET name = 'already-set' WHERE email = ?`,
      ["alice@example.com"]
    );

    await (pool as any).query(
      `UPDATE ${SCRATCH_TABLE} SET name = SUBSTRING_INDEX(email, '@', 1) WHERE name IS NULL`
    );

    const [rows]: any = await (pool as any).query(
      `SELECT name FROM ${SCRATCH_TABLE} WHERE email = ?`,
      ["alice@example.com"]
    );

    expect(rows[0].name).toBe("already-set");
  });
});
