import { AuthRepository } from "../repositories/auth.repository";
import { LoginBody } from "../types/todo";
import bcrypt from "bcrypt";
import { AppError } from "../errors/AppError";

export const AuthService = {
  async login({ email, password }: LoginBody) {
    const user = await AuthRepository.findByEmail(email);

    if (!user) {
      throw new AppError('invalid credentials', 401);
    }

    const matched = await bcrypt.compare(password, user.password_hash);

    if (!matched) {
      throw new AppError('invalid credentials', 401);
    }

    // 意図的な選択（design.md参照）: メールアドレス不明・パスワード不一致は
    // 区別せず401「invalid credentials」に統一しているのに対し、無効化アカウントは
    // パスワード一致確認の後で403を返し理由を明示する。既に正しいパスワードを
    // 知っている場合のみ到達するため実害は限定的だが、これはUXとセキュリティの
    // トレードオフとして受容済みの判断であり、直すべきバグではない。
    if (user.status === 'disabled') {
      throw new AppError('account disabled', 403);
    }

    return user;
  },

  async register({ email, password }: LoginBody) {
    if (!email || !password) {
      throw new AppError('no email or password', 400);
    }

    const existingUser = await AuthRepository.findByEmail(email);

    if (existingUser) {
      throw new AppError('User is already registered', 400);
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