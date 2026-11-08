'use client'
import React, { useState } from "react";
import Link from "next/link";
import { validateEmail, validatePassword, validateName } from "../../lib/validation";
import styles from "./LoginForm.module.css";

type Props = {
  mode: "login" | "register";
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

export default function LoginForm({ mode = "login" }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [rememberMe, setRememberMe] = useState(false);

  const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
  const action = `${API_BASE}${endpoint}`;
  const title = mode === "login" ? "ログイン" : "新規登録";

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nameError = mode === "register" ? validateName(name) : null;
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    if (nameError || emailError || passwordError) {
      setErrors({ name: nameError ?? undefined, email: emailError ?? undefined, password: passwordError ?? undefined });
      return;
    }

    try {
      const res = await fetch(action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          ...(mode === "register" ? { name } : {}),
          ...(mode === "login" ? { rememberMe } : {}),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        const data = text ? JSON.parse(text) : { message: '不明なエラーが発生しました' };
        console.error(data.message);
        return;
      }

      window.location.href = "/todos";
    } catch (err) {
      console.error("Login/Register failed:", err)
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logoLockup}>
          <svg width="26" height="26" viewBox="0 0 36 36" fill="none">
            <rect x="1.5" y="1.5" width="33" height="33" rx="9" stroke="#2f6f5e" strokeWidth="2" />
            <path d="M11 18.5L15.5 23L25 12.5" stroke="#2f6f5e" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className={styles.wordmark}>
            Todo<span className={styles.wordmarkLight}> App</span>
          </div>
        </Link>
      </header>

      <div className={styles.body}>
        <div className={styles.card}>
          <h1 className={styles.cardTitle}>{title}</h1>

          <form action={action} method="POST" onSubmit={handleSubmit}>
            <div className={styles.fields}>
              {mode === "register" && (
                <div className={styles.field}>
                  <input
                    className={`${styles.input} ${errors.name ? styles.inputError : ""}`}
                    type="text"
                    placeholder="表示名"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  {errors.name && <p className={styles.errorMsg}>{errors.name}</p>}
                </div>
              )}

              <div className={styles.field}>
                <input
                  className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
                  type="text"
                  placeholder="メールアドレス"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {errors.email && <p className={styles.errorMsg}>{errors.email}</p>}
              </div>

              <div className={styles.field}>
                <input
                  className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
                  type="password"
                  placeholder="パスワード"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {errors.password && <p className={styles.errorMsg}>{errors.password}</p>}
              </div>
            </div>

            {mode == "login" && (
              <div>
                <input
                  type="checkbox"
                  id="rememberMe"
                  name="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label htmlFor="rememberMe">ログイン情報を保存する</label>
              </div>
            )}

            <button type="submit" className={styles.submitBtn} style={{ marginTop: "8px" }}>
              {title}
            </button>
          </form>

          {mode === "login" ? (
            <p className={styles.switchText}>
              アカウントをお持ちでない方は{" "}
              <Link href="/register" className={styles.switchLink}>新規登録</Link>
            </p>
          ) : (
            <p className={styles.switchText}>
              すでにアカウントをお持ちの方は{" "}
              <Link href="/login" className={styles.switchLink}>ログイン</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
