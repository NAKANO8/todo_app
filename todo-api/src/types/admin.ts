import { AccountStatus, UserRole } from "../repositories/auth.repository";

// PATCH /admin/users/:userId/role のリクエストボディ
export type ChangeRoleBody = {
  role: UserRole;
};

// PATCH /admin/users/:userId/status のリクエストボディ
export type ChangeStatusBody = {
  status: AccountStatus;
};

// GET/PATCH /admin/users* に共通のパスパラメータ
export type AdminUserParams = {
  userId: number;
};
