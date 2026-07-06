import { RowDataPacket } from 'mysql2/promise';
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
}

