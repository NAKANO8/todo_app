"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";

import { fetchMe } from "@/lib/api/auth";
import { updateProfileName, changeProfilePassword } from "@/lib/api/profile";
import { validateName, validatePassword } from "@/lib/validation";

// タスク4.3: プロフィール画面のUI。design.md "ProfileForm / lib/api/profile.ts" 参照。
// AdminUserList.tsx と同じヘッダーパターン・トースト表示パターンに従う。

const TOAST_OPTIONS = {
  position: "top-center" as const,
  autoClose: 2000,
  theme: "colored" as const,
};

function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// design.md 389行目: 429は他のエラーと区別できるメッセージにする。
// lib/api/profile.ts の changeProfilePassword が res.status を Error#status として付与しているため、
// ここでそれを見て分岐する。
function toPasswordChangeErrorMessage(err: unknown): string {
  const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
  if (status === 429) return "しばらく待ってから再試行してください";
  return toErrorMessage(err, "パスワードの変更に失敗しました");
}

export default function ProfileForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<{
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    fetchMe()
      .then((me) => {
        setEmail(me.email);
        setName(me.name);
      })
      .catch((err) => {
        toast.error(toErrorMessage(err, "ユーザー情報の取得に失敗しました"), TOAST_OPTIONS);
      });
  }, []);

  const handleNameSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const error = validateName(name);
    if (error) {
      setNameError(error);
      return;
    }
    setNameError(null);

    try {
      await updateProfileName(name);
      toast.success("表示名を更新しました", TOAST_OPTIONS);
    } catch (err) {
      toast.error(toErrorMessage(err, "表示名の更新に失敗しました"), TOAST_OPTIONS);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const newPasswordError = validatePassword(newPassword);
    const confirmError =
      !newPasswordError && newPassword !== confirmPassword ? "新しいパスワードが一致しません" : null;
    if (newPasswordError || confirmError) {
      setPasswordErrors({
        newPassword: newPasswordError ?? undefined,
        confirmPassword: confirmError ?? undefined,
      });
      return;
    }
    setPasswordErrors({});

    try {
      const result = await changeProfilePassword(currentPassword, newPassword);
      toast.success(
        `パスワードを変更しました。他のセッション(${result.invalidatedCount}件)はログアウトされました`,
        TOAST_OPTIONS
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(toPasswordChangeErrorMessage(err), TOAST_OPTIONS);
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
          <div className="text-base font-bold tracking-tight text-[#1c2024]">プロフィール</div>
        </div>
        <Link
          href="/todos"
          className="text-[13px] font-semibold text-[#6b6f76] bg-[#f1efea] rounded-lg px-[14px] py-[7px] hover:bg-[#e6e4df] hover:text-[#1c2024]"
        >
          タスク一覧へ戻る
        </Link>
      </header>

      <div className="max-w-[560px] w-full mx-auto px-5 py-6 flex flex-col gap-5">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-bold m-0 mb-4">アカウント情報</h2>
          <form onSubmit={handleNameSubmit} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                メールアドレス
              </label>
              <p className="text-sm text-[#1c2024] m-0">{email}</p>
            </div>
            <div>
              <label
                htmlFor="profile-name"
                className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"
              >
                表示名
              </label>
              <input
                id="profile-name"
                type="text"
                placeholder="表示名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
              />
              {nameError && <p className="text-red-500 text-xs m-0 mt-1">{nameError}</p>}
            </div>
            <button
              type="submit"
              className="self-start text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md px-3 py-1.5 border border-teal-100 cursor-pointer"
            >
              更新
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-bold m-0 mb-4">パスワード変更</h2>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              placeholder="現在のパスワード"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            />
            <div>
              <input
                type="password"
                placeholder="新しいパスワード"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
              />
              {passwordErrors.newPassword && (
                <p className="text-red-500 text-xs m-0 mt-1">{passwordErrors.newPassword}</p>
              )}
            </div>
            <div>
              <input
                type="password"
                placeholder="新しいパスワード(確認用)"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
              />
              {passwordErrors.confirmPassword && (
                <p className="text-red-500 text-xs m-0 mt-1">{passwordErrors.confirmPassword}</p>
              )}
            </div>
            <button
              type="submit"
              className="self-start text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md px-3 py-1.5 border border-teal-100 cursor-pointer"
            >
              変更
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
