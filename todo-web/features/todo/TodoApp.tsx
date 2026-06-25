"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { InputTodo } from "../../components/todo/InputTodo";
import { IncompleteTodos } from "../../components/todo/IncompleteTodos";
import { CompleteTodos } from "../../components/todo/CompleteTodos";

import type { Todo } from "@/lib/types";
import { fetchTodos, createTodo, updateTodo, deleteTodo } from "@/lib/api/todos";
import styles from "./TodoApp.module.css";

export default function TodoApp() {
  const [todoText, setTodoText] = useState("");
  const [todos, setTodos] = useState<Todo[]>([]);

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

  const onClickAdd = async () => {
    if (todoText === "") return;
    await createTodo(todoText);
    const latest = await fetchTodos();
    setTodos(latest);
    setTodoText("");
  };

  const onClickDelete = async (id: number) => {
    await deleteTodo(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const onClickComplete = async (id: number) => {
    await updateTodo(id, { status: 1 });
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status: 1 } : t)));
  };

  const onClickBack = async (id: number) => {
    await updateTodo(id, { status: 0 });
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status: 0 } : t)));
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logoLockup}>
          <svg width="26" height="26" viewBox="0 0 36 36" fill="none">
            <rect x="1.5" y="1.5" width="33" height="33" rx="9" stroke="#2f6f5e" strokeWidth="2" />
            <path d="M11 18.5L15.5 23L25 12.5" stroke="#2f6f5e" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className={styles.wordmark}>
            Todo<span className={styles.wordmarkLight}> App</span>
          </div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className={styles.logoutBtn}>ログアウト</button>
        </form>
      </header>

      <div className={styles.content}>
        <InputTodo
          todoText={todoText}
          onChange={(e) => setTodoText(e.target.value)}
          onClick={onClickAdd}
          disabled={isMaxLimitIncompleteTodos}
        />

        {isMaxLimitIncompleteTodos && (
          <p style={{ color: "red", margin: 0 }}>登録できるTodoは5個までです</p>
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
      </div>
    </div>
  );
}
