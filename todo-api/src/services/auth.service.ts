import { AuthRepository } from "../repositories/auth.repository";
import { LoginBody } from "../types/todo";
import bcrypt from "bcrypt";

export const AuthService = {
  async login({ email, password }: LoginBody) {
    const user = await AuthRepository.findByEmail(email);

    if (!user) {
      throw new Error('invalid credentials');
    }

    const matched = await bcrypt.compare(password, user.password_hash);

    if (!matched) {
      throw new Error('invalid credentials');
    }

    return user;
  },

  async register({ email, password }: LoginBody) {
    if (!email || !password) {
      throw new Error('no email or password');
    }

    const existingUser = await AuthRepository.findByEmail(email);

    if (existingUser) {
      throw new Error('User is already registered');
    }

    const password_hash = await bcrypt.hash(password, 10);

    await AuthRepository.createUser({ email, password_hash });
  },

  async me(userId: number) {
    const user = await AuthRepository.findById(userId);
    if (!user) throw new Error('User not found');
    return user;
  },
}