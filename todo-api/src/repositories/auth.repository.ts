import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/client';

type CreateUserInput = {
  email: string;
  password_hash: string;
}

export type UserRole = 'admin' | 'member';
export type AccountStatus = 'active' | 'disabled';

export type User = RowDataPacket & {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  status: AccountStatus;
};

export type UserSummary = RowDataPacket & {
  id: number;
  email: string;
  role: UserRole;
  status: AccountStatus;
};

export const AuthRepository = {
  async findByEmail(email: string) {
    const [rows] = await pool.query<User[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows[0] ?? null;
  },

  async findById(id: number) {
    const [rows] = await pool.query<User[]>(
      'SELECT id, email, role, status FROM users WHERE id = ?',
      [id]
    );
    return rows[0] ?? null;
  },

  async findAll() {
    const [rows] = await pool.query<UserSummary[]>(
      'SELECT id, email, role, status FROM users'
    );
    return rows;
  },

  async createUser({ email, password_hash }: CreateUserInput) {
    await pool.query(
      `INSERT INTO users (email, password_hash) VALUES (?, ?)`,
      [email, password_hash]
    );
  },

  // 対象(userId)のロールを newRole に更新する。
  // 「有効な管理者が最低1人残る」不変条件は、count→updateの2ステップではなく
  // このUPDATE文のWHERE句に一本化してアトミックに強制する。
  // 判定は対象行(id)基準であり、誰が要求したか(自分自身か第三者か)は問わない
  // (requesterIdはこの判定に不要 — design.mdのSQLサンプルもrequesterIdを参照しない)。
  //
  // - newRole === 'admin'（昇格）: 無条件で許可
  // - newRole === 'member'（降格）: 対象(id)を除いて、他に有効な管理者
  //   (role='admin' AND status='active') が1人以上いる場合のみ許可
  //
  // updated_at = NOW() を明示的にSETに含めることで、role の値そのものが
  // 変化しない冪等な再送（例: 既にmemberの行へ再度 newRole='member' を送る）でも
  // affectedRows >= 1 を得られるようにする。mysql2の既定設定
  // (非CLIENT_FOUND_ROWS)では、値が変化しない列のみのUPDATEは
  // affectedRows に数えられないため。
  async updateRole(userId: number, newRole: UserRole): Promise<number> {
    // 注意: design.mdのSQLサンプルは `EXISTS (SELECT 1 FROM users WHERE ...)` を
    // そのままUPDATE対象テーブル(users)に対するサブクエリとして書いているが、
    // MySQLは「UPDATEの対象テーブルをFROM句(のサブクエリ)で直接参照する」ことを
    // 許可しない(ERROR 1093: You can't specify target table 'users' for update
    // in FROM clause)。これは自己代入(SET col = (SELECT ... FROM 同テーブル))に
    // 限らず、WHERE内のEXISTSサブクエリが同テーブルを直接参照する場合にも発生する
    // ことを実際のMySQL 8.0.46で確認済み。標準的な回避策として、サブクエリを
    // 派生テーブル(FROM句のネストしたSELECT)でラップし、一旦マテリアライズさせる
    // ことで同テーブル直接参照の制約を回避する。判定内容(対象行基準・
    // 有効な他の管理者の存在確認)自体はdesign.mdの意図と同一で変更していない。
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE users
       SET role = ?, updated_at = NOW()
       WHERE id = ?
         AND (? = 'admin' OR EXISTS (
           SELECT 1 FROM (
             SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?
           ) AS other_active_admins
         ))`,
      [newRole, userId, newRole, userId]
    );
    return result.affectedRows;
  },

  // 対象(userId)のアカウント状態を newStatus に更新する。updateRole と同じ理由・
  // 同じ回避策（派生テーブルでのEXISTSラップ）で、不変条件「有効な管理者が
  // 最低1人残る」をUPDATE文のWHERE句に一本化してアトミックに強制する。
  // 判定は対象行(id)基準であり、誰が要求したか(自分自身か第三者か)は問わない
  // (requesterIdはこの判定に不要。自己ターゲット時のセッション破棄判定は
  // コントローラー層の別タスクの責務)。
  //
  // - newStatus === 'active'（再有効化）: 無条件で許可
  // - newStatus === 'disabled'（無効化）: 対象(id)を除いて、他に有効な管理者
  //   (role='admin' AND status='active') が1人以上いる場合のみ許可
  //
  // updated_at = NOW() を明示的にSETに含めることで、status の値そのものが
  // 変化しない冪等な再送（例: 既にdisabledの行へ再度 newStatus='disabled' を
  // 送る）でも affectedRows >= 1 を得られるようにする（updateRole と同じ理由）。
  async updateStatus(userId: number, newStatus: AccountStatus): Promise<number> {
    // updateRole と同じMySQL 8.0の制約(ERROR 1093)を回避するため、EXISTSサブ
    // クエリを派生テーブルでラップしている。詳細はupdateRoleのコメント参照。
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE users
       SET status = ?, updated_at = NOW()
       WHERE id = ?
         AND (? = 'active' OR EXISTS (
           SELECT 1 FROM (
             SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?
           ) AS other_active_admins
         ))`,
      [newStatus, userId, newStatus, userId]
    );
    return result.affectedRows;
  },
}

