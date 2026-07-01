import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { DoneTodos } from "../DoneTodos";
import type { Todo } from "@/lib/types";

const mockTodos: Todo[] = [
  { id: 1, title: "完了Todo1", status: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: 2, title: "完了Todo2", status: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];

describe("DoneTodos", () => {
  it("Todoリストの各タイトルが表示される", () => {
    render(<DoneTodos todos={mockTodos} onRestore={vi.fn()} />);
    expect(screen.getByText("完了Todo1")).toBeInTheDocument();
    expect(screen.getByText("完了Todo2")).toBeInTheDocument();
  });

  it("リストが空のとき、Todoアイテムが表示されない", () => {
    render(<DoneTodos todos={[]} onRestore={vi.fn()} />);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it('"戻す" ボタンクリック時に onRestore が todo.id とともに呼ばれる', async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    render(<DoneTodos todos={mockTodos} onRestore={onRestore} />);
    await user.click(screen.getAllByRole("button", { name: "戻す" })[0]);
    expect(onRestore).toHaveBeenCalledWith(1);
  });
});
