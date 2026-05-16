import { LoginBody } from "../types/todo";
import bcrypt from "bcrypt";

export const AuthService  = {
  async register({ email, password }: LoginBody) {
    if (!email || !password) {
      const err = new Error('Invalid input');
      err.statusCode = 400;
      throw err;
    }

    const existingUser = await db.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      const err = new Error('Email already exists');
      err.statusCode = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.user.create({
      data: {
        email,
        passwordHash,
        isVerified: true
      }
    });
  }
}