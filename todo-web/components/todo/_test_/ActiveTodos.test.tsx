import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ActiveTodos } from "../ActiveTodos";
import type { Todo } from "@/lib/types";

const mockTodos: Todo[] = [
  { id: 1, title: "未完了Todo1", status: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: 2, title: "未完了Todo2", status: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];

describe("ActiveTodos", () => {
  it("Todoリストの各タイトルが表示される", () => {
    render(<ActiveTodos todos={mockTodos} onComplete={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("未完了Todo1")).toBeInTheDocument();
    expect(screen.getByText("未完了Todo2")).toBeInTheDocument();
  });

  it("リストが空のとき、Todoアイテムが表示されない", () => {
    render(<ActiveTodos todos={[]} onComplete={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it('"完了" ボタンクリック時に onComplete が todo.id とともに呼ばれる', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<ActiveTodos todos={mockTodos} onComplete={onComplete} onDelete={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "完了" })[0]);
    expect(onComplete).toHaveBeenCalledWith(1);
  });

  it('"削除" ボタンクリック時に onDelete が todo.id とともに呼ばれる', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<ActiveTodos todos={mockTodos} onComplete={vi.fn()} onDelete={onDelete} />);
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    expect(onDelete).toHaveBeenCalledWith(1);
  });
});
