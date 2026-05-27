'use client'
import React, { useState } from "react";
import Link from "next/link";
import { validateEmail, validatePassword } from "../../lib/validation";

type Props = {
  mode: "login" | "register";
};

export default function LoginForm({mode = "login"}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const action =
    mode === "login"
      ? "/api/auth/login"
      : "/api/auth/register";

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    if (emailError || passwordError) {
      setErrors({
        email: emailError ?? undefined,
        password: passwordError ?? undefined,
      })
      return
    }
    e.currentTarget.submit();
  }

  return (
    <>
      <form
        action={action}
        method="POST"
        onSubmit={handleSubmit}
      >
        <div>
          <input
            type="text"
            placeholder="メールアドレス"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email && <p>{errors.email}</p>}
        </div>

        <div>
          <input
            type="password"
            name="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.password && <p>{errors.password}</p>}
        </div>
        <button type="submit">
          {mode === "login" ? "ログイン" : "新規登録"}
        </button>
        {mode === "login" ? (
          <p>アカウントをお持ちでない方は<Link href="/register">新規登録</Link></p>
        ) : (
          <p>すでにアカウントをお持ちの方は<Link href="/login">ログイン</Link></p>
        )}
      </form>
    </>
  )
}
