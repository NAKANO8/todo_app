"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import type { AccountStatus, User, UserRole } from "@/lib/types";
import { fetchUsers, updateUserRole, updateUserStatus } from "@/lib/api/adminUsers";

const TOAST_OPTIONS = {
  position: "top-center" as const,
  autoClose: 2000,
  theme: "colored" as const,
};

function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export default function AdminUserList() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch((err) => {
        toast.error(toErrorMessage(err, "ユーザー一覧の取得に失敗しました"), TOAST_OPTIONS);
      });
  }, []);

  const handleRoleChange = async (userId: number, newRole: UserRole) => {
    try {
      await updateUserRole(userId, newRole);
      const latest = await fetchUsers();
      setUsers(latest);
    } catch (err) {
      toast.error(toErrorMessage(err, "ロールの変更に失敗しました"), TOAST_OPTIONS);
    }
  };

  const handleStatusChange = async (userId: number, newStatus: AccountStatus) => {
    try {
      await updateUserStatus(userId, newStatus);
      const latest = await fetchUsers();
      setUsers(latest);
    } catch (err) {
      toast.error(toErrorMessage(err, "アカウント状態の変更に失敗しました"), TOAST_OPTIONS);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#1c2024]">
      <header className="flex items-center justify-between px-5 py-[18px] border-b border-[#e6e4df] bg-white">
        <div className="text-base font-bold tracking-tight text-[#1c2024]">
          ユーザー管理
        </div>
      </header>

      <div className="max-w-[880px] w-full mx-auto px-5 py-6">
        <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm border border-gray-100">
          <thead>
            <tr className="bg-[#f1efea] text-left">
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">メール</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">ロール</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">状態</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="px-3 py-2.5 text-sm text-[#1c2024]">{u.email}</td>
                <td className="px-3 py-2.5 text-sm text-[#1c2024]">
                  {u.role === "admin" ? "管理者" : "一般ユーザー"}
                </td>
                <td className="px-3 py-2.5 text-sm text-[#1c2024]">
                  {u.status === "active" ? "有効" : "無効"}
                </td>
                <td className="px-3 py-2.5 flex gap-2">
                  <button
                    onClick={() => handleRoleChange(u.id, u.role === "admin" ? "member" : "admin")}
                    className="text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md px-2.5 py-1 border border-teal-100 cursor-pointer"
                  >
                    {u.role === "admin" ? "一般ユーザーにする" : "管理者にする"}
                  </button>
                  {u.status === "active" ? (
                    <button
                      onClick={() => handleStatusChange(u.id, "disabled")}
                      className="text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-md px-2.5 py-1 border border-red-100 cursor-pointer"
                    >
                      無効化
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStatusChange(u.id, "active")}
                      className="text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md px-2.5 py-1 border border-teal-100 cursor-pointer"
                    >
                      再有効化
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
