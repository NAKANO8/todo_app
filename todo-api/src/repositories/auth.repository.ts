import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/client';

type CreateUserInput = {
  email: string;
  passwordHash: string
}

type User = RowDataPacket & {
  id: number;
  email: string;
  passwordHash: string;
};

export const AuthRepository = {
  async findByEmail(email: string) {
    const [rows] = await pool.query<User[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    )
    return rows[0] ?? null;
  },
  
  async createUser({
    email,
    passwordHash
  }: CreateUserInput) {
    await pool.query(
      `INSERT INTO users (email, passwordHash)
        VALUES (?, ?)`,
        [email, passwordHash]
    );
  },
}

