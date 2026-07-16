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

const STATUS_TEST_EMAILS = [
  "auth_repo_status_test_sole_admin@example.com",
  "auth_repo_status_test_admin_a@example.com",
  "auth_repo_status_test_admin_b@example.com",
  "auth_repo_status_test_disabled_peer_admin@example.com",
  "auth_repo_status_test_reenable_sole_admin@example.com",
  "auth_repo_status_test_resend_member@example.com",
];

// profile-screen spec, task 2.2 (ProfileService): updateName / findPasswordHashById /
// updatePasswordHash 用のfixture。他ユーザーの行が影響を受けないことを検証するため
// 各テストにつき2ユーザー(対象・非対象)を用意する。
const PROFILE_TEST_EMAILS = [
  "auth_repo_profile_test_update_name_target@example.com",
  "auth_repo_profile_test_update_name_other@example.com",
  "auth_repo_profile_test_find_password_hash@example.com",
  "auth_repo_profile_test_update_password_hash_target@example.com",
  "auth_repo_profile_test_update_password_hash_other@example.com",
];

afterAll(async () => {
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL]);
  await (pool as any).query("DELETE FROM users WHERE email = ?", [TEST_EMAIL_FINDALL]);
  for (const email of ROLE_TEST_EMAILS) {
    await (pool as any).query("DELETE FROM users WHERE email = ?", [email]);
  }
  for (const email of STATUS_TEST_EMAILS) {
    await (pool as any).query("DELETE FROM users WHERE email = ?", [email]);
  }
  for (const email of PROFILE_TEST_EMAILS) {
    await (pool as any).query("DELETE FROM users WHERE email = ?", [email]);
  }
  await pool.end();
});

// updateRole/updateStatus の不変条件チェックは「対象(id)を除いて、他に有効な
// 管理者 (role='admin' AND status='active') が存在するか」をシステム全体で
// 判定する (design.md AdminUserService Invariants節)。そのため「対象が唯一の
// 有効な管理者」というシナリオを決定的に再現するには、テスト対象以外の既存の
// 有効な管理者 (実開発DBに存在し得る本物の管理者アカウント等) を一時的に
// 無効化する必要がある。
//
// これを「実際にUPDATEしてコミットし、後で元に戻す」方式で行うと、Vitestが
// テストファイルごとに別プロセス/別コネクションプールで並行実行する都合上、
// このコミット～復元の間の一時的な無効化状態を、無関係な別ファイル
// (db/_test_/usersSchema.test.ts の「既存行はすべて status='active'」という
// 要件3.2チェックなど) が自分のコネクションから観測してしまい、フレーキーに
// 失敗する（実測: 連続6回中2回失敗）。
//
// そこで、無効化とその検証（run() 内の AuthRepository 呼び出しを含む）を
// 「専用コネクション上の、最後まで一度もコミットされないトランザクション」
// として実行する。
// - InnoDBのMVCCにより、コミットされていない変更は他のコネクション（別
//   ファイルが使う別のプール/コネクション）の通常のSELECTには一切見えない。
//   よって usersSchema.test.ts 側が本物の管理者行を「一時的に無効化された
//   状態」で観測することは構造的に発生し得ない。
// - run() の実行中だけ、AuthRepository が内部で使う `pool.query` をこの
//   専用コネクションの `query` に差し替える。AuthRepository のコード自体は
//   変更しない（相変わらず `pool.query(...)` を呼ぶだけ）が、その呼び出しが
//   今だけ同じトランザクションに参加することで、AuthRepository の呼び出しも
//   自分自身がまだコミットしていない無効化を正しく観測できる（同一
//   コネクション内では自分の未コミットの書き込みは常に見える）。
// - 最後は必ず ROLLBACK する。実アカウントの行は一度もコミットされないため、
//   元の値へ戻す処理は不要（そもそも一度も確定変更していない）。
// - try/finally で必ず pool.query を元に戻してからロールバック・release
//   する。ここを崩すと、以降の（このファイル内の）テストが誤って専用
//   コネクションに向いたままになってしまう。
async function withOnlyActiveAdminBeing(
  soleAdminId: number,
  run: () => Promise<void>
) {
  const conn = await (pool as any).getConnection();
  const originalQuery = pool.query.bind(pool);
  try {
    await conn.beginTransaction();

    await conn.query(
      "UPDATE users SET status = 'disabled' WHERE role = 'admin' AND status = 'active' AND id <> ?",
      [soleAdminId]
    );

    (pool as any).query = conn.query.bind(conn);

    await run();
  } finally {
    (pool as any).query = originalQuery;
    await conn.rollback();
    conn.release();
  }
}

async function createFixtureUser(
  email: string,
  role: "admin" | "member",
  status: "active" | "disabled"
): Promise<number> {
  await AuthRepository.createUser({ email, password_hash: "hashedpassword", name: "Fixture User" });
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
      name: "Auth Repo Test",
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

  // Requirement 1.1: 認証済みユーザーが自分のアカウント情報を取得すると
  // name が含まれること（findById がその読み取り経路）
  it("findById が作成時に指定した name を含めて返す", async () => {
    const created = await AuthRepository.findByEmail(TEST_EMAIL);
    expect(created).not.toBeNull();

    const found = await AuthRepository.findById(created!.id);

    expect(found).not.toBeNull();
    expect(found!.name).toBe("Auth Repo Test");
  });

  it("findAll がパスワードハッシュを含まず、role・status・name付きで全ユーザーを返す", async () => {
    await AuthRepository.createUser({
      email: TEST_EMAIL_FINDALL,
      password_hash: "hashedpassword",
      name: "Auth Repo Test FindAll",
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
    expect(target!.name).toBe("Auth Repo Test FindAll");
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

  describe("updateStatus", () => {
    it("唯一の有効な管理者を disabled にしようとすると affectedRows は 0 になり、status は active のまま変化しない", async () => {
      const soleAdminId = await createFixtureUser(
        "auth_repo_status_test_sole_admin@example.com",
        "admin",
        "active"
      );

      await withOnlyActiveAdminBeing(soleAdminId, async () => {
        const affectedRows = await AuthRepository.updateStatus(soleAdminId, "disabled");
        expect(affectedRows).toBe(0);

        const found = await AuthRepository.findById(soleAdminId);
        expect(found!.status).toBe("active");
      });
    });

    it("他に有効な管理者が存在する場合、管理者を disabled にすると affectedRows は 1 になり status が更新される", async () => {
      const adminAId = await createFixtureUser(
        "auth_repo_status_test_admin_a@example.com",
        "admin",
        "active"
      );
      const adminBId = await createFixtureUser(
        "auth_repo_status_test_admin_b@example.com",
        "admin",
        "active"
      );

      // adminB がもう1人の有効な管理者(adminA)なので、adminA の無効化は許可される
      const affectedRows = await AuthRepository.updateStatus(adminAId, "disabled");
      expect(affectedRows).toBe(1);

      const found = await AuthRepository.findById(adminAId);
      expect(found!.status).toBe("disabled");

      // 冪等な再送: 既にdisabledへの無効化が完了済みの状態へ同じ値(disabled)を
      // 再送しても、updated_at の強制更新により affectedRows は 1 のまま
      // (対象なし・不変条件違反と誤認しない)
      const resendAffectedRows = await AuthRepository.updateStatus(adminAId, "disabled");
      expect(resendAffectedRows).toBe(1);

      // adminB は操作されていないので有効な管理者のまま
      const adminB = await AuthRepository.findById(adminBId);
      expect(adminB!.role).toBe("admin");
      expect(adminB!.status).toBe("active");

      // このテストの成功パス自体が adminA を disabled へ実コミットしている
      // (updateStatus はトランザクションでラップしていない通常のプールを
      // 使うため)。afterAll でのファイル末尾クリーンアップまで disabled の
      // まま放置すると、並行実行される別ファイル
      // (db/_test_/usersSchema.test.ts の「既存行は全て active」チェック等)
      // がこの行を disabled のまま観測し得るため、このテスト自身の終了前に
      // 実際に active へ戻す。
      await (pool as any).query("UPDATE users SET status = 'active' WHERE id = ?", [
        adminAId,
      ]);
    });

    it("第三者操作でも、対象が唯一の有効な管理者であれば無効化は拒否される（requesterの概念を使わないtarget基準の判定）。無効化済みの管理者は保護対象の母数に含まれない", async () => {
      const soleActiveAdminId = await createFixtureUser(
        "auth_repo_status_test_reenable_sole_admin@example.com",
        "admin",
        "active"
      );
      const disabledAdminId = await createFixtureUser(
        "auth_repo_status_test_disabled_peer_admin@example.com",
        "admin",
        "disabled"
      );

      await withOnlyActiveAdminBeing(soleActiveAdminId, async () => {
        const affectedRows = await AuthRepository.updateStatus(
          soleActiveAdminId,
          "disabled"
        );
        expect(affectedRows).toBe(0);

        const found = await AuthRepository.findById(soleActiveAdminId);
        expect(found!.status).toBe("active");
      });

      // 無効化済みの管理者は保護対象の母数に含まれないことの確認用に
      // 作成したのみなので、そのまま削除対象にする
      await (pool as any).query("DELETE FROM users WHERE id = ?", [disabledAdminId]);
    });

    it("唯一の管理者であっても、disabled から active への再有効化は無条件に許可される", async () => {
      const soleAdminId = await createFixtureUser(
        "auth_repo_status_test_resend_member@example.com",
        "admin",
        "disabled"
      );

      await withOnlyActiveAdminBeing(soleAdminId, async () => {
        // soleAdminId 自身は現時点で disabled なので、この時点でシステムに
        // 有効な管理者は0人だが、再有効化(active)方向には最後の管理者
        // チェックを適用しない
        const affectedRows = await AuthRepository.updateStatus(soleAdminId, "active");
        expect(affectedRows).toBe(1);

        const found = await AuthRepository.findById(soleAdminId);
        expect(found!.status).toBe("active");

        // 冪等な再送: 既にactiveへの再有効化が完了済みの状態へ同じ値(active)を
        // 再送しても、updated_at の強制更新により affectedRows は 1 のまま
        const resendAffectedRows = await AuthRepository.updateStatus(
          soleAdminId,
          "active"
        );
        expect(resendAffectedRows).toBe(1);
      });

      // このテストの成功パス（再有効化）は withOnlyActiveAdminBeing の
      // トランザクション内 (最後に必ず ROLLBACK される) で実行しているため、
      // 実際にコミットされている行は fixture 作成時点の status='disabled'
      // のままである。afterAll でのファイル末尾クリーンアップまで disabled
      // のまま放置すると、並行実行される別ファイル
      // (db/_test_/usersSchema.test.ts の「既存行は全て active」チェック等)
      // がこの行を disabled のまま観測し得るため、このテスト自身の終了前に
      // 実際に active へ戻す。
      await (pool as any).query("UPDATE users SET status = 'active' WHERE id = ?", [
        soleAdminId,
      ]);
    });

    it("存在しない userId を対象にした場合、affectedRows は 0 になる", async () => {
      const nonExistentUserId = 999_999_999;
      const affectedRows = await AuthRepository.updateStatus(nonExistentUserId, "disabled");
      expect(affectedRows).toBe(0);
    });
  });

  // profile-screen spec, task 2.2 (ProfileService.updateName): 対象(userId)の
  // 行だけが更新され、他ユーザーの行は影響を受けないこと(design.md
  // ProfileService Invariants節: "userIdと一致しないユーザーの行が変更される
  // ことはない")
  describe("updateName", () => {
    it("対象userIdのnameのみを更新し、affectedRowsを返す。他ユーザーの行は変化しない", async () => {
      await AuthRepository.createUser({
        email: "auth_repo_profile_test_update_name_target@example.com",
        password_hash: "hashedpassword",
        name: "Original Name",
      });
      await AuthRepository.createUser({
        email: "auth_repo_profile_test_update_name_other@example.com",
        password_hash: "hashedpassword",
        name: "Other Original Name",
      });
      const target = await AuthRepository.findByEmail(
        "auth_repo_profile_test_update_name_target@example.com"
      );
      const other = await AuthRepository.findByEmail(
        "auth_repo_profile_test_update_name_other@example.com"
      );
      expect(target).not.toBeNull();
      expect(other).not.toBeNull();

      const affectedRows = await AuthRepository.updateName(
        target!.id,
        "Updated Name"
      );
      expect(affectedRows).toBe(1);

      const updatedTarget = await AuthRepository.findById(target!.id);
      expect(updatedTarget!.name).toBe("Updated Name");

      // 他ユーザーの行は影響を受けない
      const unchangedOther = await AuthRepository.findById(other!.id);
      expect(unchangedOther!.name).toBe("Other Original Name");
    });

    it("存在しない userId を対象にした場合、affectedRows は 0 になる", async () => {
      const nonExistentUserId = 999_999_999;
      const affectedRows = await AuthRepository.updateName(
        nonExistentUserId,
        "Someone"
      );
      expect(affectedRows).toBe(0);
    });
  });

  // profile-screen spec, task 2.2 (ProfileService.changePassword): 現在パスワード
  // 照合専用の単一カラム読み取り(SELECT * 禁止方針に沿い password_hash のみ取得)
  describe("findPasswordHashById", () => {
    it("対象userIdのpassword_hashのみを返す", async () => {
      await AuthRepository.createUser({
        email: "auth_repo_profile_test_find_password_hash@example.com",
        password_hash: "hashed-password-for-lookup",
        name: "Password Hash Lookup",
      });
      const created = await AuthRepository.findByEmail(
        "auth_repo_profile_test_find_password_hash@example.com"
      );
      expect(created).not.toBeNull();

      const passwordHash = await AuthRepository.findPasswordHashById(
        created!.id
      );

      expect(passwordHash).toBe("hashed-password-for-lookup");
    });

    it("存在しない userId を対象にした場合、null を返す", async () => {
      const nonExistentUserId = 999_999_999;
      const passwordHash = await AuthRepository.findPasswordHashById(
        nonExistentUserId
      );
      expect(passwordHash).toBeNull();
    });
  });

  // profile-screen spec, task 2.2 (ProfileService.changePassword): 対象(userId)の
  // 行だけが更新され、他ユーザーの行は影響を受けないこと(updateNameと同じ不変条件)
  describe("updatePasswordHash", () => {
    it("対象userIdのpassword_hashのみを更新し、affectedRowsを返す。他ユーザーの行は変化しない", async () => {
      await AuthRepository.createUser({
        email: "auth_repo_profile_test_update_password_hash_target@example.com",
        password_hash: "original-hash-target",
        name: "Password Change Target",
      });
      await AuthRepository.createUser({
        email: "auth_repo_profile_test_update_password_hash_other@example.com",
        password_hash: "original-hash-other",
        name: "Password Change Other",
      });
      const target = await AuthRepository.findByEmail(
        "auth_repo_profile_test_update_password_hash_target@example.com"
      );
      const other = await AuthRepository.findByEmail(
        "auth_repo_profile_test_update_password_hash_other@example.com"
      );
      expect(target).not.toBeNull();
      expect(other).not.toBeNull();

      const affectedRows = await AuthRepository.updatePasswordHash(
        target!.id,
        "updated-hash-target"
      );
      expect(affectedRows).toBe(1);

      const updatedTargetHash = await AuthRepository.findPasswordHashById(
        target!.id
      );
      expect(updatedTargetHash).toBe("updated-hash-target");

      // 他ユーザーの行は影響を受けない
      const unchangedOtherHash = await AuthRepository.findPasswordHashById(
        other!.id
      );
      expect(unchangedOtherHash).toBe("original-hash-other");
    });

    it("存在しない userId を対象にした場合、affectedRows は 0 になる", async () => {
      const nonExistentUserId = 999_999_999;
      const affectedRows = await AuthRepository.updatePasswordHash(
        nonExistentUserId,
        "some-hash"
      );
      expect(affectedRows).toBe(0);
    });
  });
});
