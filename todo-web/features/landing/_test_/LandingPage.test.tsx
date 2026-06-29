import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import LandingPage from "../LandingPage";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("LandingPage", () => {
  it('見出し "シンプルさこそ便利さ。" が表示される', () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: "シンプルさこそ便利さ。" })).toBeInTheDocument();
  });

  it("/login へのリンクが表示される", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "ログイン" })).toHaveAttribute("href", "/login");
  });

  it("/register へのリンクが表示される", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "新規登録" })).toHaveAttribute("href", "/register");
  });
});
