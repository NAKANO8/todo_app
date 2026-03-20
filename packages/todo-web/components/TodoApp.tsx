"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { InputTodo } from "./todo/InputTodo";
import { IncompleteTodos } from "./todo/IncompleteTodos";
import { CompleteTodos } from "./todo/CompleteTodos";

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

  // 追加
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
    setTodos(await fetchTodos());
  };

  // 完了
  const onClickComplete = async (id: number) => {
    await updateTodo(id, { status: 1 });
    setTodos(await fetchTodos());
  };

  // 戻す
  const onClickBack = async (id: number) => {
    await updateTodo(id, { status: 0 });
    setTodos(await fetchTodos());
  };

  return (
    <>
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

