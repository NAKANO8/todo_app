// タスク4.2: プロフィール向けAPIクライアント。
// lib/api/adminUsers.ts / todos.ts と同じ直接fetchパターン(NEXT_PUBLIC_API_BASE,
// credentials: "include")に従う(design.md "Web / Feature" ProfileForm / lib/api/profile.ts参照)。
// エラー処理は design.md の指示(「lib/api/todos.ts と同様にthrow new Error(...)」)に従い、
// AdminApiErrorのような専用クラスは設けない。

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

export async function updateProfileName(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/profile/name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    credentials: "include",
  });

  if (!res.ok) throw new Error("Failed to update profile name");
}

export async function changeProfilePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ invalidatedCount: number }> {
  const res = await fetch(`${API_BASE}/profile/password`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
    credentials: "include",
  });

  if (!res.ok) throw new Error("Failed to change password");
  return res.json();
}
