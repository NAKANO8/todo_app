"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";

import { TodoInput } from "../../components/todo/TodoInput";
import { ActiveTodos } from "../../components/todo/ActiveTodos";
import { DoneTodos } from "../../components/todo/DoneTodos";

import type { Todo } from "@/lib/types";
import { fetchTodos, createTodo, updateTodo, deleteTodo } from "@/lib/api/todos";
import { fetchMe } from "@/lib/api/auth";

export default function TodoApp() {
  const [inputValue, setInputValue] = useState("");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchTodos().then(setTodos).catch(console.error);
  }, []);

  useEffect(() => {
    fetchMe()
      .then((me) => setIsAdmin(me.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  const activeTodos = todos.filter(t => t.status === 0);
  const doneTodos = todos.filter(t => t.status === 1);

  const isTodoLimitReached = activeTodos.length >= 5;

  useEffect(() => {
    if (isTodoLimitReached) {
      toast.error("登録できるのは5個までです", {
        position: "top-center",
        autoClose: 2000,
        theme: "colored",
      });
    }
  }, [isTodoLimitReached]);

  const handleAdd = async () => {
    if (inputValue === "") return;
    await createTodo(inputValue);
    const latest = await fetchTodos();
    setTodos(latest);
    setInputValue("");
  };

  const handleDelete = async (id: number) => {
    await deleteTodo(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const handleComplete = async (id: number) => {
    await updateTodo(id, { status: 1 });
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status: 1 } : t)));
  };

  const handleRestore = async (id: number) => {
    await updateTodo(id, { status: 0 });
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status: 0 } : t)));
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#1c2024]">
      <header className="flex items-center justify-between px-5 py-[18px] border-b border-[#e6e4df] bg-white">
        <div className="flex items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 36 36" fill="none">
            <rect x="1.5" y="1.5" width="33" height="33" rx="9" stroke="#2f6f5e" strokeWidth="2" />
            <path d="M11 18.5L15.5 23L25 12.5" stroke="#2f6f5e" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="text-base font-bold tracking-tight text-[#1c2024]">
            Todo<span className="font-medium text-[#6b6f76]"> App</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/admin/users"
              className="text-[13px] font-semibold text-[#6b6f76] bg-[#f1efea] rounded-lg px-[14px] py-[7px] hover:bg-[#e6e4df] hover:text-[#1c2024]"
            >
              管理者画面
            </Link>
          )}
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-[13px] font-semibold text-[#6b6f76] bg-[#f1efea] rounded-lg px-[14px] py-[7px] cursor-pointer hover:bg-[#e6e4df] hover:text-[#1c2024]"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-[440px] w-full mx-auto px-5 py-6 flex flex-col gap-3 md:max-w-[560px] xl:max-w-[680px]">
        <TodoInput
          inputValue={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onAdd={handleAdd}
          disabled={isTodoLimitReached}
        />

        {isTodoLimitReached && (
          <p className="text-red-500 text-sm m-0">登録できるTodoは5個までです</p>
        )}

        <ActiveTodos
          todos={activeTodos}
          onComplete={handleComplete}
          onDelete={handleDelete}
        />

        <DoneTodos
          todos={doneTodos}
          onRestore={handleRestore}
        />
      </div>
    </div>
  );
}
