'use client'
import React, { useState } from "react";
import Link from "next/link";
import { validateEmail, validatePassword } from "../../lib/validation";
import styles from "./LoginForm.module.css";

type Props = {
  mode: "login" | "register";
};

export default function LoginForm({ mode = "login" }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const action = mode === "login" ? "/api/auth/login" : "/api/auth/register";
  const title = mode === "login" ? "ログイン" : "新規登録";

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError || passwordError) {
      setErrors({ email: emailError ?? undefined, password: passwordError ?? undefined });
      return;
    }
    e.currentTarget.submit();
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
