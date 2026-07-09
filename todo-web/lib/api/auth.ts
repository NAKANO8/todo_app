import type { UserRole } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

export type CurrentUser = {
  id: number;
  email: string;
  role: UserRole;
};

export async function fetchMe(): Promise<CurrentUser> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch current user");
  return res.json();
}
