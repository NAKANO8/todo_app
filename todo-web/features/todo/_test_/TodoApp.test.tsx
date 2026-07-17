import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTodos, createTodo, updateTodo, deleteTodo } from "@/lib/api/todos";
import { fetchMe } from "@/lib/api/auth";
import TodoApp from "../TodoApp";
import type { Todo } from "@/lib/types";

vi.mock("@/lib/api/todos", () => ({
  fetchTodos: vi.fn(),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  fetchMe: vi.fn(),
}));

vi.mock("react-toastify", () => ({
  toast: { error: vi.fn() },
}));

const mockFetchTodos = vi.mocked(fetchTodos);
const mockCreateTodo = vi.mocked(createTodo);
const mockUpdateTodo = vi.mocked(updateTodo);
const mockDeleteTodo = vi.mocked(deleteTodo);
const mockFetchMe = vi.mocked(fetchMe);

const mockIncompleteTodo: Todo = {
  id: 1, title: "未完了Todo", status: 0,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};
const mockCompleteTodo: Todo = {
  id: 2, title: "完了Todo", status: 1,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

describe("TodoApp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchTodos.mockResolvedValue([mockIncompleteTodo]);
    mockCreateTodo.mockResolvedValue(undefined);
    mockUpdateTodo.mockResolvedValue(undefined);
    mockDeleteTodo.mockResolvedValue(undefined);
    mockFetchMe.mockResolvedValue({ id: 1, email: "member@example.com", role: "member", name: "Member" });
  });

  it("管理者でログインしている場合、管理者画面へのリンクが表示される", async () => {
    mockFetchMe.mockResolvedValue({ id: 1, email: "admin@example.com", role: "admin", name: "Admin" });

    render(<TodoApp />);

    const link = await screen.findByRole("link", { name: "管理者画面" });
    expect(link).toHaveAttribute("href", "/admin/users");
  });

  it("一般ユーザーでログインしている場合、管理者画面へのリンクは表示されない", async () => {
    render(<TodoApp />);
    await waitFor(() => expect(screen.getByText("未完了Todo")).toBeInTheDocument());

    expect(screen.queryByRole("link", { name: "管理者画面" })).not.toBeInTheDocument();
  });

  it("ユーザー情報の取得に失敗した場合、管理者画面へのリンクは表示されない", async () => {
    mockFetchMe.mockRejectedValue(new Error("network error"));

    render(<TodoApp />);
    await waitFor(() => expect(screen.getByText("未完了Todo")).toBeInTheDocument());

    expect(screen.queryByRole("link", { name: "管理者画面" })).not.toBeInTheDocument();
  });

  it("マウント時にフェッチされたTodoが表示される", async () => {
    render(<TodoApp />);
    await waitFor(() => expect(screen.getByText("未完了Todo")).toBeInTheDocument());
  });

  it("新しいTodoを追加すると未完了セクションに表示される", async () => {
    const user = userEvent.setup();
    const newTodo: Todo = {
      id: 3, title: "新しいTodo", status: 0,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    };
    mockFetchTodos
      .mockResolvedValueOnce([mockIncompleteTodo])
      .mockResolvedValueOnce([mockIncompleteTodo, newTodo]);

    render(<TodoApp />);
    await waitFor(() => expect(screen.getByText("未完了Todo")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Todoを入力"), "新しいTodo");
    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => expect(screen.getByText("新しいTodo")).toBeInTheDocument());
  });

  it("完了ボタンクリックでTodoが完了セクションに移動する", async () => {
    const user = userEvent.setup();
    render(<TodoApp />);
    await waitFor(() => expect(screen.getByRole("button", { name: "完了" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "完了" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "戻す" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "完了" })).not.toBeInTheDocument();
    expect(mockUpdateTodo).toHaveBeenCalledWith(1, { status: 1 });
  });

  it("削除ボタンクリックでTodoがリストから削除される", async () => {
    const user = userEvent.setup();
    render(<TodoApp />);
    await waitFor(() => expect(screen.getByText("未完了Todo")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => expect(screen.queryByText("未完了Todo")).not.toBeInTheDocument());
    expect(mockDeleteTodo).toHaveBeenCalledWith(1);
  });

  it("戻すボタンクリックでTodoが未完了セクションに移動する", async () => {
    const user = userEvent.setup();
    mockFetchTodos.mockResolvedValueOnce([mockCompleteTodo]);
    render(<TodoApp />);
    await waitFor(() => expect(screen.getByRole("button", { name: "戻す" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "戻す" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "完了" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "戻す" })).not.toBeInTheDocument();
    expect(mockUpdateTodo).toHaveBeenCalledWith(2, { status: 0 });
  });

  it("未完了Todoが5件の時点では追加ボタンは有効で、6件目の追加を試みると無効化され警告メッセージが表示される", async () => {
    const user = userEvent.setup();
    const fiveTodos: Todo[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1, title: `Todo${i + 1}`, status: 0 as const,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    }));
    mockFetchTodos.mockResolvedValueOnce(fiveTodos);

    render(<TodoApp />);
    await waitFor(() => expect(screen.getByText("Todo1")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "追加" })).not.toBeDisabled();
    expect(screen.queryByText("登録できるTodoは5個までです")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Todoを入力"), "Todo6");
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(mockCreateTodo).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
    expect(screen.getByText("登録できるTodoは5個までです")).toBeInTheDocument();
  });

  it("上限到達後にロックされた状態では、再度クリックしてもTodoが追加されない", async () => {
    const user = userEvent.setup();
    const fiveTodos: Todo[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1, title: `Todo${i + 1}`, status: 0 as const,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    }));
    mockFetchTodos.mockResolvedValueOnce(fiveTodos);

    render(<TodoApp />);
    await waitFor(() => expect(screen.getByText("Todo1")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Todoを入力"), "Todo6");
    await user.click(screen.getByRole("button", { name: "追加" }));
    expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(mockCreateTodo).not.toHaveBeenCalled();
  });
});
