import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { InputTodo } from "../InputTodo";

describe("InputTodo", () => {
  it("入力フィールドとボタンがレンダリングされる", () => {
    render(
      <InputTodo
        todoText=""
        onChange={vi.fn()}
        onClick={vi.fn()}
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
      <InputTodo
        todoText=""
        onChange={onChange}
        onClick={vi.fn()}
        disabled={false}
      />
    );

    await user.type(screen.getByPlaceholderText("Todoを入力"), "新しいTodo");
    expect(onChange).toHaveBeenCalled();
  });

  it("追加ボタンクリック時にonClickが呼ばれる", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <InputTodo
        todoText="テスト"
        onChange={vi.fn()}
        onClick={onClick}
        disabled={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "追加" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disabled=trueのときボタンと入力が無効になる", () => {
    render(
      <InputTodo
        todoText=""
        onChange={vi.fn()}
        onClick={vi.fn()}
        disabled={true}
      />
    );

    expect(screen.getByPlaceholderText("Todoを入力")).toBeDisabled();
    expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
  });
});
