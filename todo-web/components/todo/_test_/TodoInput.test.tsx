import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TodoInput } from "../TodoInput";

describe("TodoInput", () => {
  it("入力フィールドとボタンがレンダリングされる", () => {
    render(
      <TodoInput
        inputValue=""
        onChange={vi.fn()}
        onAdd={vi.fn()}
        disabled={false}
      />
    );

    expect(screen.getByPlaceholderText("Todoを入力")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("テキスト入力時にonChangeが呼ばれる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <TodoInput
        inputValue=""
        onChange={onChange}
        onAdd={vi.fn()}
        disabled={false}
      />
    );

    await user.type(screen.getByPlaceholderText("Todoを入力"), "新しいTodo");
    expect(onChange).toHaveBeenCalled();
  });

  it("追加ボタンクリック時にonAddが呼ばれる", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(
      <TodoInput
        inputValue="テスト"
        onChange={vi.fn()}
        onAdd={onAdd}
        disabled={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("disabled=trueのときボタンと入力が無効になる", () => {
    render(
      <TodoInput
        inputValue=""
        onChange={vi.fn()}
        onAdd={vi.fn()}
        disabled={true}
      />
    );

    expect(screen.getByPlaceholderText("Todoを入力")).toBeDisabled();
    expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
  });
});
