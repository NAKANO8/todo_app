// PATCH /profile/name のリクエストボディ
export type UpdateNameBody = {
  name: string;
};

// PATCH /profile/password のリクエストボディ
export type ChangePasswordBody = {
  currentPassword: string;
  newPassword: string;
};
