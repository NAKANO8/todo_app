import type { AccountStatus, User, UserRole } from "@/lib/types";

// タスク4.1: 管理者向けAPIクライアント。
// lib/api/todos.ts と同じ直接fetchパターン(NEXT_PUBLIC_API_BASE, credentials: "include")
// に従う(design.md "Web / Feature"参照)。

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

// AdminUserController([adminUser.controller.ts](../../../todo-api/src/controllers/adminUser.controller.ts))
// が返す { message } とstatusCode(404/409等)を呼び出し側(AdminUserList)で判別できるよう保持する。
export class AdminApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function toAdminApiError(res: Response, fallback: string): Promise<AdminApiError> {
  const body = await res.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message : fallback;
  return new AdminApiError(res.status, message);
}

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/admin/users`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw await toAdminApiError(res, "Failed to fetch users");
  return res.json();
}

export async function updateUserRole(userId: number, role: UserRole): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/users/${userId}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
    credentials: "include",
  });

  if (!res.ok) throw await toAdminApiError(res, "Failed to update user role");
}

export async function updateUserStatus(
  userId: number,
  status: AccountStatus
): Promise<{ invalidatedCount: number }> {
  const res = await fetch(`${API_BASE}/admin/users/${userId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
    credentials: "include",
  });

  if (!res.ok) throw await toAdminApiError(res, "Failed to update user status");
  return res.json();
}
