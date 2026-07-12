import { describe, it, expect } from "vitest";
import { pool } from "../../db/client";
import { AuthRepository } from "../auth.repository";

// タスク5.1: 「管理者がちょうど2人」の状態で、自己降格の同時実行・相互降格の同時実行の
// 両方について、片方のみ成功し有効な管理者が必ず1人残ることを実DBで検証する。
//
// この検証はモックでは意味がない(実際のMySQLの行ロック・MVCCが本質)。また
// auth.repository.test.ts の withOnlyActiveAdminBeing は単一コネクション上の
// 未コミットトランザクションに他の呼び出しを閉じ込める方式のため、そのままでは
// 複数コネクションにまたがる本物の同時実行を再現できない(1本のコネクションは
// コマンドを直列に処理するため)。そのため、このファイルでは実DB上の既存の
// アクティブな管理者を一時的に実コミットで無効化し、テスト対象の2人だけを
// アクティブな管理者にした状態を作る。try/finallyで必ず元に戻す。

async function createFixtureAdmin(email: string): Promise<number> {
  await AuthRepository.createUser({ email, password_hash: "hashedpassword" });
  const created = await AuthRepository.findByEmail(email);
  if (!created) throw new Error(`fixture user not created: ${email}`);
  await (pool as any).query(
    "UPDATE users SET role = 'admin', status = 'active' WHERE id = ?",
    [created.id]
  );
  return created.id;
}

async function withExactlyTwoActiveAdmins(
  adminAId: number,
  adminBId: number,
  run: () => Promise<void>
) {
  const [otherAdmins]: any = await (pool as any).query(
    "SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND id NOT IN (?, ?)",
    [adminAId, adminBId]
  );
  const otherAdminIds: number[] = otherAdmins.map((r: any) => r.id);

  if (otherAdminIds.length > 0) {
    await (pool as any).query(
      `UPDATE users SET status = 'disabled' WHERE id IN (${otherAdminIds.map(() => "?").join(",")})`,
      otherAdminIds
    );
  }
  try {
    await run();
  } finally {
    if (otherAdminIds.length > 0) {
      await (pool as any).query(
        `UPDATE users SET status = 'active' WHERE id IN (${otherAdminIds.map(() => "?").join(",")})`,
        otherAdminIds
      );
    }
  }
}

describe("AuthRepository.updateRole 同時実行時の最後の管理者保護 (Requirements 7.1-7.4)", () => {
  it("管理者2人が同時に自分自身を降格させようとすると、片方のみ成功し1人は admin のまま残る", async () => {
    const adminAId = await createFixtureAdmin("auth_repo_concurrency_self_a@example.com");
    const adminBId = await createFixtureAdmin("auth_repo_concurrency_self_b@example.com");

    try {
      await withExactlyTwoActiveAdmins(adminAId, adminBId, async () => {
        const results = await Promise.allSettled([
          AuthRepository.updateRole(adminAId, "member"),
          AuthRepository.updateRole(adminBId, "member"),
        ]);

        const successes = results.filter(
          (r) => r.status === "fulfilled" && r.value === 1
        ).length;
        expect(successes).toBe(1);

        const [adminA, adminB] = await Promise.all([
          AuthRepository.findById(adminAId),
          AuthRepository.findById(adminBId),
        ]);
        const remainingAdmins = [adminA, adminB].filter(
          (u) => u!.role === "admin" && u!.status === "active"
        ).length;
        expect(remainingAdmins).toBe(1);
      });
    } finally {
      await (pool as any).query("DELETE FROM users WHERE id IN (?, ?)", [adminAId, adminBId]);
    }
  });

  it("管理者2人が同時に互いを降格させ合おうとすると、片方のみ成功し1人は admin のまま残る", async () => {
    const adminAId = await createFixtureAdmin("auth_repo_concurrency_mutual_a@example.com");
    const adminBId = await createFixtureAdmin("auth_repo_concurrency_mutual_b@example.com");

    try {
      await withExactlyTwoActiveAdmins(adminAId, adminBId, async () => {
        // A が B を降格、B が A を降格 (相互降格)
        const results = await Promise.allSettled([
          AuthRepository.updateRole(adminBId, "member"),
          AuthRepository.updateRole(adminAId, "member"),
        ]);

        const successes = results.filter(
          (r) => r.status === "fulfilled" && r.value === 1
        ).length;
        expect(successes).toBe(1);

        const [adminA, adminB] = await Promise.all([
          AuthRepository.findById(adminAId),
          AuthRepository.findById(adminBId),
        ]);
        const remainingAdmins = [adminA, adminB].filter(
          (u) => u!.role === "admin" && u!.status === "active"
        ).length;
        expect(remainingAdmins).toBe(1);
      });
    } finally {
      await (pool as any).query("DELETE FROM users WHERE id IN (?, ?)", [adminAId, adminBId]);
    }
  });
});
