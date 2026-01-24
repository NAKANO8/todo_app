import type { Todo } from "@/lib/types";

const API_BASE = "http://localhost:3001";

export async function fetchTodos(): Promise<Todo[]> {
  const res = await fetch(`${API_BASE}/todos`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch todos");
  return res.json();
}

export async function createTodo(title: string) {
  const res = await fetch(`${API_BASE}/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) throw new Error("Failed to create todo");
}

export async function updateTodo(id: number, data: Partial<Todo>) {
  const res = await fetch(`${API_BASE}/todos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to update todo");
}

export async function deleteTodo(id: number) {
  const res = await fetch(`${API_BASE}/todos/${id}`, {
    method: "DELETE",
  });

  if (!res.ok) throw new Error("Failed to delete todo");
}

