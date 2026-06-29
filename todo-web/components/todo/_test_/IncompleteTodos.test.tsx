import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { IncompleteTodos } from "../IncompleteTodos";
import type { Todo } from "@/lib/types";

const mockTodos: Todo[] = [
  { id: 1, title: "未完了Todo1", status: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: 2, title: "未完了Todo2", status: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];

describe("IncompleteTodos", () => {
  it("Todoリストの各タイトルが表示される", () => {
    render(<IncompleteTodos todos={mockTodos} onClickComplete={vi.fn()} onClickDelete={vi.fn()} />);
    expect(screen.getByText("未完了Todo1")).toBeInTheDocument();
    expect(screen.getByText("未完了Todo2")).toBeInTheDocument();
  });

  it("リストが空のとき、Todoアイテムが表示されない", () => {
    render(<IncompleteTodos todos={[]} onClickComplete={vi.fn()} onClickDelete={vi.fn()} />);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it('"完了" ボタンクリック時に onClickComplete が todo.id とともに呼ばれる', async () => {
    const user = userEvent.setup();
    const onClickComplete = vi.fn();
    render(<IncompleteTodos todos={mockTodos} onClickComplete={onClickComplete} onClickDelete={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "完了" })[0]);
    expect(onClickComplete).toHaveBeenCalledWith(1);
  });

  it('"削除" ボタンクリック時に onClickDelete が todo.id とともに呼ばれる', async () => {
    const user = userEvent.setup();
    const onClickDelete = vi.fn();
    render(<IncompleteTodos todos={mockTodos} onClickComplete={vi.fn()} onClickDelete={onClickDelete} />);
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    expect(onClickDelete).toHaveBeenCalledWith(1);
  });
});
