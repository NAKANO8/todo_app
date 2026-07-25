import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
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
//
// task 3.2 (orm-migration): auth.repository.test.ts は「他に有効な管理者を
// 一時的に無効化する」判定を未コミットトランザクションに閉じ込めたため、
// このファイルの実コミットによる一時無効化と同時に走ると互いの管理者数の
// 前提を壊し合う。auth.repository.test.ts側と同じ名前付きロックでファイル
// 全体の実行区間を相互排他する(このファイル自体の実コミット設計は、
// 別途human判断待ちのため変更しない)。
const LAST_ADMIN_INVARIANT_LOCK_NAME = "orm_migration_last_admin_invariant_test";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lastAdminInvariantLockConn: any;

beforeAll(async () => {
  lastAdminInvariantLockConn = await (pool as any).getConnection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows]: any = await lastAdminInvariantLockConn.query(
    "SELECT GET_LOCK(?, 60) AS acquired",
    [LAST_ADMIN_INVARIANT_LOCK_NAME]
  );
  if (rows[0].acquired !== 1) {
    throw new Error(
      "failed to acquire last-admin-invariant test lock (timed out after 60s)"
    );
  }
});

afterAll(async () => {
  await lastAdminInvariantLockConn.query("SELECT RELEASE_LOCK(?)", [
    LAST_ADMIN_INVARIANT_LOCK_NAME,
  ]);
  lastAdminInvariantLockConn.release();
});

async function createFixtureAdmin(email: string): Promise<number> {
  await AuthRepository.createUser({ email, password_hash: "hashedpassword", name: "Fixture Admin" });
  const created = await AuthRepository.findByEmail(email);
  if (!created) throw new Error(`fixture user not created: ${email}`);
  await (pool as any).query(
    "UPDATE users SET role = 'admin', status = 'active' WHERE id = ?",
    [created.id]
  );
  return created.id;
}

// Requirements 3.5-3.9 (orm-migration): この不変条件は仕様上もっとも
// 安全側に倒すべき箇所であるため、上記の実コミット方式に対する追加の
// 安全策として、MySQLネイティブの一回限りEVENT(イベントスケジューラ)を
// ウォッチドッグとして張る。try/finallyによる復元(正常系での高速な復元)を
// 置き換えるものではなく、あくまでプロセスがkill -9/SIGTERM等で
// 無効化コミット後・復元コミット前に死んだ場合のためのバックストップ。
// event_schedulerはNodeプロセスと完全に独立したMySQLサーバ内蔵のスレッドで
// 動作するため、Nodeプロセスの生死に関係なく発火する。
//
// 実行順序: (1) 無効化UPDATEをコミットする前に、対象の管理者IDを
// 数秒後にactiveへ戻す一回限りのEVENTを作成する。EVENT作成自体に失敗した
// 場合(権限不足等)は、安全策が張れないまま実コミットに進むのは危険なため、
// このヘルパーは例外を投げてテストを失敗させる(黙って安全策なしで
// 進めない)。(2) 通常どおり無効化UPDATEをコミットする。(3) run()の実行後、
// 既存のtry/finallyによる復元が成功したら、もうEVENTは不要なので明示的に
// DROP EVENTする(発火前に消えるので通常は一度も発火しない)。finallyでの
// 復元自体が失敗した場合(プロセスは生きているがDB復元に失敗するケース)は、
// このDROPには到達せず、EVENTが張られたまま残ることで引き続き
// バックストップとして機能する。
//
// 前回実行のEVENTが既にこの実行より前に発火・自己修復済みだった場合
// (前回プロセスがkillされ、放置しても数秒後に自動復旧していたケース)は、
// 対象の管理者IDが既にactiveに戻っているだけであり、今回の実行には
// 無害・透過的(EVENT名を実行ごとに一意にしているため衝突しない。また
// ON COMPLETION NOT PRESERVEにより発火後は自動的に消えるため、前回分の
// EVENTがSHOW EVENTSに残り続けることもない)。
const ADMIN_RESTORE_WATCHDOG_DELAY_SECONDS = 5;

function makeAdminRestoreWatchdogEventName(): string {
  // pid + UUID由来のランダムサフィックスで実行ごとに一意にする(MySQLの
  // 識別子長制限64文字に十分収まる長さに切り詰める)。
  const suffix = randomUUID().replace(/-/g, "").slice(0, 16);
  return `admin_restore_wd_${process.pid}_${suffix}`;
}

async function armAdminRestoreWatchdog(adminIds: number[]): Promise<string> {
  const eventName = makeAdminRestoreWatchdogEventName();
  const placeholders = adminIds.map(() => "?").join(",");
  try {
    await (pool as any).query(
      `CREATE EVENT \`${eventName}\`
       ON SCHEDULE AT (NOW() + INTERVAL ${ADMIN_RESTORE_WATCHDOG_DELAY_SECONDS} SECOND)
       ON COMPLETION NOT PRESERVE
       DO UPDATE users SET status = 'active' WHERE id IN (${placeholders})`,
      adminIds
    );
  } catch (e) {
    throw new Error(
      "failed to arm the MySQL EVENT safety net that restores real admin " +
        "accounts if this process is killed mid-test (Requirements 3.5-3.9 " +
        "treat this as the most safety-critical invariant in this spec) -- " +
        `refusing to proceed with the real-commit admin disable without it: ${
          (e as Error).message
        }`
    );
  }
  return eventName;
}

async function disarmAdminRestoreWatchdog(eventName: string): Promise<void> {
  // IF EXISTS: ON COMPLETION NOT PRESERVEの一回限りEVENTは、稀に自身の
  // 発火が先に走っていれば(通常発生しない想定だが)既に自己削除済みの
  // 場合がある。その場合でもDROPをエラーにしない。
  await (pool as any).query(`DROP EVENT IF EXISTS \`${eventName}\``);
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

  let watchdogEventName: string | null = null;
  if (otherAdminIds.length > 0) {
    // 実コミットで無効化する直前に安全策を張る。
    watchdogEventName = await armAdminRestoreWatchdog(otherAdminIds);

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
  // ここに到達するのは上記finallyの復元が例外を投げずに完了した場合のみ。
  // 復元が成功した以上、もう安全策は不要なので発火前に解除する。
  if (watchdogEventName) {
    await disarmAdminRestoreWatchdog(watchdogEventName);
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
