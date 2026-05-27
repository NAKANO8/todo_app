"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { InputTodo } from "../../components/todo/InputTodo";
import { IncompleteTodos } from "../../components/todo/IncompleteTodos";
import { CompleteTodos } from "../../components/todo/CompleteTodos";

import type { Todo } from "@/lib/types";
import { fetchTodos, createTodo, updateTodo, deleteTodo } from "@/lib/api/todos";

export default function TodoApp() {
  const [todoText, setTodoText] = useState("");
  const [todos, setTodos] = useState<Todo[]>([]);

  // 初期ロード
  useEffect(() => {
    fetchTodos().then(setTodos).catch(console.error);
  }, []);

  const incompleteTodos = todos.filter(t => t.status === 0);
  const completeTodos = todos.filter(t => t.status === 1);

  const isMaxLimitIncompleteTodos = incompleteTodos.length >= 5;

  useEffect(() => {
    if (isMaxLimitIncompleteTodos) {
      toast.error("登録できるのは5個までです", {
        position: "top-center",
        autoClose: 2000,
        theme: "colored",
      });
    }
  }, [isMaxLimitIncompleteTodos]);

  // 追加（作成後にIDが必要なため1回だけ再取得）
  const onClickAdd = async () => {
    if (todoText === "") return;
    await createTodo(todoText);
    const latest = await fetchTodos();
    setTodos(latest);
    setTodoText("");
  };

  // 削除
  const onClickDelete = async (id: number) => {
    await deleteTodo(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  // 完了
  const onClickComplete = async (id: number) => {
    await updateTodo(id, { status: 1 });
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status: 1 } : t)));
  };

  // 戻す
  const onClickBack = async (id: number) => {
    await updateTodo(id, { status: 0 });
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status: 0 } : t)));
  };

  return (
    <>
      <form action="/api/auth/logout" method="POST">
        <button type="submit">ログアウト</button>
      </form>

      <InputTodo
        todoText={todoText}
        onChange={(e) => setTodoText(e.target.value)}
        onClick={onClickAdd}
        disabled={isMaxLimitIncompleteTodos}
      />

      {isMaxLimitIncompleteTodos && (
        <p style={{ color: "red" }}>登録できるTodoは5個までです</p>
      )}

      <IncompleteTodos
        todos={incompleteTodos}
        onClickComplete={onClickComplete}
        onClickDelete={onClickDelete}
      />

      <CompleteTodos
        todos={completeTodos}
        onClickBack={onClickBack}
      />
    </>
  );
}

