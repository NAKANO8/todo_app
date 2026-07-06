import { describe, it, expect, afterAll } from "vitest";
import { pool } from "../../db/client";
import { AuthRepository } from "../auth.repository";

const TEST_EMAIL = "auth_repo_test@example.com";
const TEST_EMAIL_FINDALL = "auth_repo_test_findall@example.com";

const ROLE_TEST_EMAILS = [
  "auth_repo_role_test_sole_admin@example.com",
  "auth_repo_role_test_sole_admin_disabled_peer@example.com",
  "auth_repo_role_test_disabled_peer_admin@example.com",
  "auth_repo_role_test_admin_a@example.com",
  "auth_repo_role_test_admin_b@example.com",
  "auth_repo_role_test_promote_member@example.com",
];

afterAll(async () => {
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL_FINDALL]);
  for (const email of ROLE_TEST_EMAILS) {
    await (pool as any).query("DELETE FROM users WHERE email = ?", [email]);
  }
  await pool.end();
});

// updateRole の不変条件チェックは「対象(id)を除いて、他に有効な管理者
// (role='admin' AND status='active') が存在するか」をシステム全体で判定する
// (design.md AdminUserService Invariants節)。そのため「対象が唯一の有効な管理者」
// というシナリオを決定的に再現するには、テスト対象以外の既存の有効な管理者
// (実開発DBに存在し得る本物の管理者アカウント等)を一時的に無効化し、
// テスト終了後に元の状態へ確実に復元する必要がある。
async function withOnlyActiveAdminBeing(
  soleAdminId: number,
  run: () => Promise<void>
) {
  const [rows] = await (pool as any).query(
    "SELECT id, status FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?",
    [soleAdminId]
  );
  const others = rows as { id: number; status: string }[];
  try {
    for (const other of others) {
      await (pool as any).query("UPDATE users SET status = 'disabled' WHERE id = ?", [
        other.id,
      ]);
    }
    await run();
  } finally {
    for (const other of others) {
      await (pool as any).query("UPDATE users SET status = ? WHERE id = ?", [
        other.status,
        other.id,
      ]);
    }
  }
}

async function createFixtureUser(
  email: string,
  role: "admin" | "member",
  status: "active" | "disabled"
): Promise<number> {
  await AuthRepository.createUser({ email, password_hash: "hashedpassword" });
  const created = await AuthRepository.findByEmail(email);
  if (!created) throw new Error(`fixture user not created: ${email}`);
  await (pool as any).query("UPDATE users SET role = ?, status = ? WHERE id = ?", [
    role,
    status,
    created.id,
  ]);
  return created.id;
}

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

  describe("updateRole", () => {
    it("唯一の有効な管理者を member に降格しようとすると affectedRows は 0 になり、role は admin のまま変化しない", async () => {
      const soleAdminId = await createFixtureUser(
        "auth_repo_role_test_sole_admin@example.com",
        "admin",
        "active"
      );

      await withOnlyActiveAdminBeing(soleAdminId, async () => {
        const affectedRows = await AuthRepository.updateRole(soleAdminId, "member");
        expect(affectedRows).toBe(0);

        const found = await AuthRepository.findById(soleAdminId);
        expect(found!.role).toBe("admin");
      });
    });

    it("他に有効な管理者が存在する場合、管理者を member に降格すると affectedRows は 1 になり role が更新される", async () => {
      const adminAId = await createFixtureUser(
        "auth_repo_role_test_admin_a@example.com",
        "admin",
        "active"
      );
      const adminBId = await createFixtureUser(
        "auth_repo_role_test_admin_b@example.com",
        "admin",
        "active"
      );

      // adminB がもう1人の有効な管理者(adminA)なので、adminA の降格は許可される
      const affectedRows = await AuthRepository.updateRole(adminAId, "member");
      expect(affectedRows).toBe(1);

      const found = await AuthRepository.findById(adminAId);
      expect(found!.role).toBe("member");

      // 冪等な再送: 既にmemberへの降格が完了済みの状態へ同じ値(member)を
      // 再送しても、updated_at の強制更新により affectedRows は 1 のまま
      // (対象なし・不変条件違反と誤認しない)
      const resendAffectedRows = await AuthRepository.updateRole(adminAId, "member");
      expect(resendAffectedRows).toBe(1);

      // adminB は操作されていないので有効な管理者のまま
      const adminB = await AuthRepository.findById(adminBId);
      expect(adminB!.role).toBe("admin");
    });

    it("第三者操作でも、対象が唯一の有効な管理者であれば降格は拒否される（requesterの概念を使わないtarget基準の判定）", async () => {
      // updateRole(userId, newRole) にはrequester概念自体が存在しない。
      // 「第三者が操作している」状況は、単に別ユーザーが唯一の管理者を対象に
      // 呼び出すのと同じ呼び出し形になる。ここでは無効化済みの管理者
      // (有効な管理者の母数には含まれない)が同時に存在する状態でも、
      // 唯一の有効な管理者への降格が拒否されることを確認する
      const soleActiveAdminId = await createFixtureUser(
        "auth_repo_role_test_sole_admin_disabled_peer@example.com",
        "admin",
        "active"
      );
      const disabledAdminId = await createFixtureUser(
        "auth_repo_role_test_disabled_peer_admin@example.com",
        "admin",
        "disabled"
      );

      await withOnlyActiveAdminBeing(soleActiveAdminId, async () => {
        const affectedRows = await AuthRepository.updateRole(
          soleActiveAdminId,
          "member"
        );
        expect(affectedRows).toBe(0);

        const found = await AuthRepository.findById(soleActiveAdminId);
        expect(found!.role).toBe("admin");
      });

      // 無効化済みの管理者は保護対象の母数に含まれないことの確認用に
      // 作成したのみなので、そのまま削除対象にする
      await (pool as any).query("DELETE FROM users WHERE id = ?", [disabledAdminId]);
    });

    it("member を admin に昇格する変更は、他に有効な管理者がいなくても無条件に許可される", async () => {
      const memberId = await createFixtureUser(
        "auth_repo_role_test_promote_member@example.com",
        "member",
        "active"
      );

      await withOnlyActiveAdminBeing(memberId, async () => {
        // memberId 自身は admin ではないので、この時点でシステムに有効な
        // 管理者は0人だが、昇格方向には最後の管理者チェックを適用しない
        const affectedRows = await AuthRepository.updateRole(memberId, "admin");
        expect(affectedRows).toBe(1);

        const found = await AuthRepository.findById(memberId);
        expect(found!.role).toBe("admin");
      });
    });

    it("存在しない userId を対象にした場合、affectedRows は 0 になる", async () => {
      const nonExistentUserId = 999_999_999;
      const affectedRows = await AuthRepository.updateRole(nonExistentUserId, "member");
      expect(affectedRows).toBe(0);
    });
  });
});
