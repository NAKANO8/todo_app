"use client";

import { useState, useEffect } from "react";
import { toast } from "react-toastify";

import { InputTodo } from "./todo/InputTodo";
import { IncompleteTodos } from "./todo/IncompleteTodos";
import { CompleteTodos } from "./todo/CompleteTodos";
import type { Todo } from "@/lib/types";

export default function Todo() {
  const [todoText, setTodoText] = useState<string>("");
  const [incompleteTodos, setIncompleteTodos] = useState<Todo[]>([]);
  const [completeTodos, setCompleteTodos] = useState<Todo[]>([]);

  const onChangeTodoText = (event: React.ChangeEvent<HTMLInputElement>) => setTodoText(event.target.value);

  const onClickAdd = () => {
    if (todoText === "") return;

    const newTodo: Todo = {
      id: Date.now(),
      title: todoText,
    };

    setIncompleteTodos([...incompleteTodos, newTodo]);
    setTodoText("")
  };

  const onClickDelete = (id: number) => {
    setIncompleteTodos(incompleteTodos.filter(todo => todo.id !== id));
  };

  const onClickComplete = (id: number) => {
    const target = incompleteTodos.find(todo => todo.id === id);
    if (!target) return;

    setIncompleteTodos(incompleteTodos.filter(todo => todo.id !== id));
    setCompleteTodos([...completeTodos, target]);
  };

  const onClickBack = (id: number) => {
    const target = completeTodos.find(todo => todo.id === id);
    if (!target) return;

    setCompleteTodos(completeTodos.filter(todo => todo.id !== id));
    setIncompleteTodos([...incompleteTodos, target]);
  };


  const isMaxLimitIncompleteTodos = incompleteTodos.length >= 5

  useEffect(() => {
    if (isMaxLimitIncompleteTodos) {
      toast.error("登録できるのは5個までです", {
        position: "top-center",
        autoClose: 2000,
        theme: "colored",
      });
    }
  }, [isMaxLimitIncompleteTodos])

  return (
    <>
      <InputTodo todoText={todoText} onChange={onChangeTodoText} onClick={onClickAdd} disabled={isMaxLimitIncompleteTodos} />
      {isMaxLimitIncompleteTodos && (<p style={{ color: "red" }}>登録できるTodoは5個までです</p>)}
      <IncompleteTodos todos={incompleteTodos} onClickComplete={onClickComplete} onClickDelete={onClickDelete} />
      <CompleteTodos todos={completeTodos} onClickBack={onClickBack} />
    </>
  )
}
