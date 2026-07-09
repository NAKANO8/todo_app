"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";

import type { AccountStatus, User, UserRole } from "@/lib/types";
import { AdminApiError, fetchUsers, updateUserRole, updateUserStatus } from "@/lib/api/adminUsers";

const TOAST_OPTIONS = {
  position: "top-center" as const,
  autoClose: 2000,
  theme: "colored" as const,
};

function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// AdminUserService(唯一の有効な管理者を保護するロジック)が拒否した場合、APIは
// 409(降格/無効化不可)または404(対象なし)を返す。生の英語メッセージをそのまま
// 出すのではなく、画面の言語(日本語)に合わせた理由を表示する。
function toAdminActionErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AdminApiError) {
    if (err.status === 409) return "唯一の有効な管理者のため、この操作はできません";
    if (err.status === 404) return "対象のユーザーが見つかりませんでした";
  }
  return toErrorMessage(err, fallback);
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
      toast.error(toAdminActionErrorMessage(err, "ロールの変更に失敗しました"), TOAST_OPTIONS);
    }
  };

  const handleStatusChange = async (userId: number, newStatus: AccountStatus) => {
    try {
      await updateUserStatus(userId, newStatus);
      const latest = await fetchUsers();
      setUsers(latest);
    } catch (err) {
      toast.error(toAdminActionErrorMessage(err, "アカウント状態の変更に失敗しました"), TOAST_OPTIONS);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#1c2024]">
      <header className="flex items-center justify-between px-5 py-[18px] border-b border-[#e6e4df] bg-white">
        <div className="flex items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 36 36" fill="none">
            <rect x="1.5" y="1.5" width="33" height="33" rx="9" stroke="#2f6f5e" strokeWidth="2" />
            <circle cx="18" cy="14" r="4" stroke="#2f6f5e" strokeWidth="2.6" />
            <path
              d="M10 27C10 22 13.5 19 18 19C22.5 19 26 22 26 27"
              stroke="#2f6f5e"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
          <div className="text-base font-bold tracking-tight text-[#1c2024]">
            ユーザー管理
          </div>
        </div>
        <Link
          href="/todos"
          className="text-[13px] font-semibold text-[#6b6f76] bg-[#f1efea] rounded-lg px-[14px] py-[7px] hover:bg-[#e6e4df] hover:text-[#1c2024]"
        >
          タスク一覧へ戻る
        </Link>
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
