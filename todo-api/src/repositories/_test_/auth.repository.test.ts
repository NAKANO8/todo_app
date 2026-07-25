import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../../db/client";
import { prisma } from "../../db/prismaClient";
import type { Prisma } from "../../generated/prisma/client";
import { AuthRepository } from "../auth.repository";

// task 3.2 (orm-migration): このファイルは"他に有効な管理者がいない"状態を
// withOnlyActiveAdminBeing 内で作る。cross-file干渉を避けるため、MySQLの
// 名前付きロック(GET_LOCK/RELEASE_LOCK)でファイル全体の実行区間を
// auth.repository.concurrency.test.ts と相互排他する(詳細は下記
// withOnlyActiveAdminBeing のコメント参照)。名前付きロックはセッション
// (コネクション)に紐づくため、専用コネクションを1本確保しテストスイート
// 全体で保持する。
const LAST_ADMIN_INVARIANT_LOCK_NAME = "orm_migration_last_admin_invariant_test";
let lastAdminInvariantLockConn: any;

beforeAll(async () => {
  lastAdminInvariantLockConn = await (pool as any).getConnection();
  const [rows]: any = await lastAdminInvariantLockConn.query(
    "SELECT GET_LOCK(?, 60) AS acquired",
    [LAST_ADMIN_INVARIANT_LOCK_NAME]
  );
  if (rows[0].acquired !== 1) {
    throw new Error(
      "failed to acquire last-admin-invariant test lock (timed out after 60s)"
    );
  }

  // 前回実行がkillされてfixture行が残留していても、スイート開始前に
  // 全fixtureメールを削除しておくことで自己修復する(次回実行の
  // unique制約違反を防ぐ)。
  const allFixtureEmails = [
    TEST_EMAIL,
    TEST_EMAIL_FINDALL,
    ...ROLE_TEST_EMAILS,
    ...STATUS_TEST_EMAILS,
    ...PROFILE_TEST_EMAILS,
  ];
  for (const email of allFixtureEmails) {
    await (pool as any).query("DELETE FROM users WHERE email = ?", [email]);
  }
});

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
  await lastAdminInvariantLockConn.query("SELECT RELEASE_LOCK(?)", [
    LAST_ADMIN_INVARIANT_LOCK_NAME,
  ]);
  lastAdminInvariantLockConn.release();
  await pool.end();
  await prisma.$disconnect();
});

// updateRole/updateStatus の不変条件チェックは「対象(id)を除いて、他に有効な
// 管理者 (role='admin' AND status='active') が存在するか」をシステム全体で
// 判定する (design.md AdminUserService Invariants節)。そのため「対象が唯一の
// 有効な管理者」というシナリオを決定的に再現するには、テスト対象以外の既存の
// 有効な管理者 (実開発DBに存在し得る本物の管理者アカウント等) を一時的に
// 無効化する必要がある。
//
// 過去2回のレビューで「実際にUPDATEしてコミットし、finallyで必ず元に戻す」
// 方式(旧来のtry/finally、およびそのラップ版のafterEachスナップショット復元)
// がともに却下された。理由はクラッシュ安全性: (a) Vitestのタイムアウトは
// テスト本体を待つのをやめるだけで、放置された`run()`のPromiseチェーン自体は
// 動き続ける(=それ自体がハングし得る)ため、finally/afterEachが実行される保証
// がない、(b) それ以前に、プロセスがkill -9等で即死した場合はfinally/afterEach
// も含めNode側のコードは一切実行されない。実コミット方式である限り、この
// 「無効化コミット済み・復元コミット未実行」の間にプロセスが死ぬと、実在の
// 管理者アカウントが無期限にdisabledのまま残る。
//
// task 3.2 (orm-migration) で承認された設計変更 (design.md「設計変更（実装中に
// 発見・承認済み）」参照) はこれを構造的に解消する: updateRole/updateStatusに
// 追加された末尾オプション引数 tx を使い、「他の管理者を無効化する→検証対象の
// 呼び出しを実行する→アサーションする」の一連の流れ全体を、単一の
// `prisma.$transaction(async (tx) => {...})` に閉じ込め、最後に必ず
// (成功時・失敗時を問わず)意図的なエラーを投げてロールバックさせる
// (＝一度もコミットしない)。この方式では:
// - プロセスが任意のタイミングでkillされても、保持していたトランザクションの
//   コネクションが切断され、MySQL側が自動的にロールバックする(アプリ側の
//   後始末コードに一切依存しない)。
// - run()に渡されるtxは無効化と同じトランザクション/コネンクションなので、
//   「自分自身の書き込みは常に見える」というトランザクションの基本性質により、
//   AuthRepository.updateRole/updateStatus(…, tx)がまだコミットされていない
//   無効化を正しく考慮できる(差し替え・モンキーパッチ不要)。
// - 「許可される(値が変わる)」系のアサーションは、同じtx経由で読み直す
//   (readRoleAndStatusViaTx参照)。tx外のシングルトンprisma経由の読み取りは
//   このトランザクションの未コミットの書き込みを見られないため。
//
// (この設計変更が承認される前、実装中に一時的に試した
// 「prisma.$transactionのインタラクティブトランザクション+prisma.$executeRaw/
// prisma.user.findUniqueの一時差し替え」方式は、同一ファイル内で連続2回呼ぶ
// だけで2回目以降の無効化が実際にコミットされてしまうPrismaランタイム内部の
// 問題を引き起こしたため採用しなかった。今回の設計はモンキーパッチではなく
// 呼び出し元が明示的にtxを渡す契約になっており、この問題は再現しない
// -- 本ファイルの全テストを複数回繰り返し実行し、実DBに対して直接確認済み)。
//
// このファイルはもう実コミットで他の管理者を無効化しないため、
// db/_test_/usersSchema.test.ts等の無関係な別ファイルが一時的な無効化状態を
// 観測することは構造的になくなった(トランザクション分離により、コミットして
// いない変更は他コネクションから一切見えない)。ただし
// `auth.repository.concurrency.test.ts`は依然として実コミット方式で他の
// 管理者を一時無効化するため(design.mdで承認された範囲は本ファイルの
// 逐次実行シナリオのみ、詳細はauth.repository.concurrency.test.ts参照)、
// そちらの実コミットと本ファイルの不変条件チェックが同時に走ると、互いの
// 管理者数の前提を壊し合う可能性が残る。ファイル先頭の`beforeAll`/`afterAll`
// で保持するMySQLの名前付きロックにより、引き続き両ファイルの実行区間を
// 相互排他する。
async function withOnlyActiveAdminBeing(
  soleAdminId: number,
  run: (tx: Prisma.TransactionClient) => Promise<void>
) {
  const rollbackSentinel = new IntentionalRollbackError();
  try {
    await prisma.$transaction(async (tx) => {
      const otherAdmins = await tx.user.findMany({
        where: { role: "admin", status: "active", id: { not: soleAdminId } },
        select: { id: true },
      });
      if (otherAdmins.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: otherAdmins.map((a) => a.id) } },
          data: { status: "disabled" },
        });
      }

      await run(tx);

      // 成功時も必ずここに到達し、意図的にロールバックさせる。無効化も
      // run()内の書き込みも、実DBには一切コミットされない。
      throw rollbackSentinel;
    });
  } catch (e) {
    if (e !== rollbackSentinel) throw e;
  }
}

// withOnlyActiveAdminBeing内のトランザクションの外(=シングルトンprisma経由)
// からは、そのトランザクションの未コミットの書き込みが見えない。「許可される
// (値が変わる)」系のアサーションは、書き込みを行ったのと同じtx経由で読み直す
// 必要がある。「拒否される(値が変わらない)」系は対象行自体が変化しないため
// (無効化されるのは他の管理者の行であり対象行ではない)、tx外のfindByIdでも
// 問題ない。
async function readRoleAndStatusViaTx(tx: Prisma.TransactionClient, userId: number) {
  const row = await tx.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });
  if (!row) throw new Error(`user not found via tx: ${userId}`);
  return row;
}

class IntentionalRollbackError extends Error {
  constructor() {
    super(
      "intentional-rollback: forces $transaction to roll back so the " +
        "disable-other-admins step is never committed; not a real failure"
    );
  }
}

async function createFixtureUser(
  email: string,
  role: "admin" | "member",
  status: "active" | "disabled"
): Promise<number> {
  // プロセスがkillされて前回実行のfixture行が残留していても、作成前に
  // 削除しておくことで次回実行が自己修復する(unique制約違反を防ぐ)。
  await (pool as any).query("DELETE FROM users WHERE email = ?", [email]);
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

      await withOnlyActiveAdminBeing(soleAdminId, async (tx) => {
        const affectedRows = await AuthRepository.updateRole(soleAdminId, "member", tx);
        expect(affectedRows).toBe(0);

        const found = await readRoleAndStatusViaTx(tx, soleAdminId);
        expect(found.role).toBe("admin");
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

      await withOnlyActiveAdminBeing(soleActiveAdminId, async (tx) => {
        const affectedRows = await AuthRepository.updateRole(
          soleActiveAdminId,
          "member",
          tx
        );
        expect(affectedRows).toBe(0);

        const found = await readRoleAndStatusViaTx(tx, soleActiveAdminId);
        expect(found.role).toBe("admin");
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

      await withOnlyActiveAdminBeing(memberId, async (tx) => {
        // memberId 自身は admin ではないので、この時点でシステムに有効な
        // 管理者は0人だが、昇格方向には最後の管理者チェックを適用しない
        const affectedRows = await AuthRepository.updateRole(memberId, "admin", tx);
        expect(affectedRows).toBe(1);

        const found = await readRoleAndStatusViaTx(tx, memberId);
        expect(found.role).toBe("admin");
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

      await withOnlyActiveAdminBeing(soleAdminId, async (tx) => {
        const affectedRows = await AuthRepository.updateStatus(soleAdminId, "disabled", tx);
        expect(affectedRows).toBe(0);

        const found = await readRoleAndStatusViaTx(tx, soleAdminId);
        expect(found.status).toBe("active");
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

      await withOnlyActiveAdminBeing(soleActiveAdminId, async (tx) => {
        const affectedRows = await AuthRepository.updateStatus(
          soleActiveAdminId,
          "disabled",
          tx
        );
        expect(affectedRows).toBe(0);

        const found = await readRoleAndStatusViaTx(tx, soleActiveAdminId);
        expect(found.status).toBe("active");
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

      await withOnlyActiveAdminBeing(soleAdminId, async (tx) => {
        // soleAdminId 自身は現時点で disabled なので、この時点でシステムに
        // 有効な管理者は0人だが、再有効化(active)方向には最後の管理者
        // チェックを適用しない
        const affectedRows = await AuthRepository.updateStatus(soleAdminId, "active", tx);
        expect(affectedRows).toBe(1);

        const found = await readRoleAndStatusViaTx(tx, soleAdminId);
        expect(found.status).toBe("active");

        // 冪等な再送: 既にactiveへの再有効化が完了済みの状態へ同じ値(active)を
        // 再送しても、updated_at の強制更新により affectedRows は 1 のまま
        const resendAffectedRows = await AuthRepository.updateStatus(
          soleAdminId,
          "active",
          tx
        );
        expect(resendAffectedRows).toBe(1);
      });

      // このテストの成功パス（再有効化）は withOnlyActiveAdminBeing の
      // トランザクション内(最後に必ずROLLBACKされる)で実行しているため、
      // 実際にコミットされている行は fixture 作成時点の status='disabled'
      // のままである。これはfixture行(このテスト専用のemailで、afterAllの
      // 明示的なDELETE対象)であり、実在の管理者アカウントではないため、
      // このテスト自身が明示的に元へ戻す必要はない(戻すとしても
      // afterAllでの削除で十分)。
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
