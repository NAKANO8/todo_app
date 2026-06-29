import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import LoginForm from "../LoginForm";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("LoginForm", () => {
  describe("login mode", () => {
    it('タイトル "ログイン" が表示される', () => {
      render(<LoginForm mode="login" />);
      expect(screen.getByRole("heading", { name: "ログイン" })).toBeInTheDocument();
    });

    it("メールアドレス・パスワード入力欄と送信ボタンが表示される", () => {
      render(<LoginForm mode="login" />);
      expect(screen.getByPlaceholderText("メールアドレス")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("パスワード")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "ログイン" })).toBeInTheDocument();
    });

    it('メールアドレスが空で送信すると "メールアドレスを入力してください!" が表示される', async () => {
      const user = userEvent.setup();
      render(<LoginForm mode="login" />);
      await user.click(screen.getByRole("button", { name: "ログイン" }));
      expect(screen.getByText("メールアドレスを入力してください!")).toBeInTheDocument();
    });

    it('不正な形式のメールで送信すると "メールの形式が正しくありません" が表示される', async () => {
      const user = userEvent.setup();
      render(<LoginForm mode="login" />);
      await user.type(screen.getByPlaceholderText("メールアドレス"), "invalid-email");
      await user.click(screen.getByRole("button", { name: "ログイン" }));
      expect(screen.getByText("メールの形式が正しくありません")).toBeInTheDocument();
    });

    it('パスワードが空で送信すると "パスワードを入力してください!" が表示される', async () => {
      const user = userEvent.setup();
      render(<LoginForm mode="login" />);
      await user.type(screen.getByPlaceholderText("メールアドレス"), "test@example.com");
      await user.click(screen.getByRole("button", { name: "ログイン" }));
      expect(screen.getByText("パスワードを入力してください!")).toBeInTheDocument();
    });

    it('強度不足のパスワードで送信すると "8文字以上・大文字1つ・数字1つ以上が必要です" が表示される', async () => {
      const user = userEvent.setup();
      render(<LoginForm mode="login" />);
      await user.type(screen.getByPlaceholderText("メールアドレス"), "test@example.com");
      await user.type(screen.getByPlaceholderText("パスワード"), "password");
      await user.click(screen.getByRole("button", { name: "ログイン" }));
      expect(screen.getByText("8文字以上・大文字1つ・数字1つ以上が必要です")).toBeInTheDocument();
    });

    it("/register へのリンクが表示される", () => {
      render(<LoginForm mode="login" />);
      expect(screen.getByRole("link", { name: "新規登録" })).toHaveAttribute("href", "/register");
    });
  });

  describe("register mode", () => {
    it('タイトル "新規登録" が表示される', () => {
      render(<LoginForm mode="register" />);
      expect(screen.getByRole("heading", { name: "新規登録" })).toBeInTheDocument();
    });

    it("/login へのリンクが表示される", () => {
      render(<LoginForm mode="register" />);
      expect(screen.getByRole("link", { name: "ログイン" })).toHaveAttribute("href", "/login");
    });
  });
});
