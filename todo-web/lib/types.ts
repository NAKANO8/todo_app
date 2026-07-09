export type Todo = {
  id: number;
  title: string;
  status: number;
  created_at: string;
  updated_at: string;
};

export type UserRole = "admin" | "member";

export type AccountStatus = "active" | "disabled";

export type User = {
  id: number;
  email: string;
  role: UserRole;
  status: AccountStatus;
};

