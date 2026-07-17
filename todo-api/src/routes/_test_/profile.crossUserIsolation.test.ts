import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp, app } from "../../app";
import { pool } from "../../db/client";
import { AuthRepository } from "../../repositories/auth.repository";

// profile-screen spec, task 5.2 (Requirement 7.1): 認証済みユーザーが表示名変更・
// パスワード変更を要求しても、要求者本人以外のユーザーのアカウントが一切変更されない
// ことを、実際のHTTPルート(PATCH /profile/name, PATCH /profile/password)・実DBを
// 通して確認する。
//
// 既存カバレッジとの違い(このファイルで初めて埋める部分):
// - services/_test_/profile.service.test.ts (task 2.2): AuthRepositoryをモックしており、
//   サービス層が呼び出し元から渡されたuserIdを一貫して下流に転送することは保証するが、
//   実在する別ユーザーの行には一切触れない。
// - repositories/_test_/auth.repository.test.ts (task 2.2): 実DBでupdateNameについては
//   対象外ユーザー行が不変であることを確認済みだが、updatePasswordHash・HTTPルート/
//   コントローラー層は経由しない。
// - routes/_test_/profile.name.api.test.ts, profile.password.api.test.ts (task 3.1/3.2):
//   AuthRepositoryをモックしており、「リクエストボディのuserIdは無視される」という
//   構造的な保証は確認済みだが、実在する第二のユーザーの実際の行(name/password_hash)が
//   実際に変化しないことまでは検証していない。
//
// このファイルはAuthRepositoryをモックせず、buildApp()で構築した実アプリ・実DB・実HTTP
// ルートを使い、2人の実ユーザーを作成してユーザーAとしてログインし、ユーザーAの表示名・
// パスワード変更操作がユーザーBの行に一切影響しないことをbyte-for-byteで確認する。

const USER_A_EMAIL = "profile_cross_user_test_a@example.com";
const USER_B_EMAIL = "profile_cross_user_test_b@example.com";
const USER_A_ORIGINAL_PASSWORD = "OriginalPasswordA1";
const USER_B_ORIGINAL_PASSWORD = "OriginalPasswordB1";
const USER_A_NEW_PASSWORD = "UpdatedPasswordA1";
const USER_A_ORIGINAL_NAME = "Cross User Test A";
const USER_B_ORIGINAL_NAME = "Cross User Test B";
const USER_A_NEW_NAME = "Cross User Test A Updated";

async function deleteFixtures() {
  await (pool as any).query("DELETE FROM users WHERE email IN (?, ?)", [
    USER_A_EMAIL,
    USER_B_EMAIL,
  ]);
}

beforeAll(async () => {
  await buildApp();
  await deleteFixtures();
});

afterAll(async () => {
  await deleteFixtures();
  await pool.end();
});

function sessionCookieFrom(res: { headers: Record<string, any> }): string {
  const setCookie = res.headers["set-cookie"];
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return cookieStr?.split(";")[0] ?? "";
}

describe("プロフィール操作の他ユーザーへの影響なし(要求者本人限定, Requirement 7.1)", () => {
  it("ユーザーAとしてログインして表示名・パスワードを変更しても、ユーザーBの行(name・password_hash)は一切変化しない", async () => {
    // --- fixture: 実際に2人の別ユーザーを登録する ---
    const registerA = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: USER_A_EMAIL,
        password: USER_A_ORIGINAL_PASSWORD,
        name: USER_A_ORIGINAL_NAME,
      },
    });
    expect(registerA.statusCode).toBe(201);

    const registerB = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: USER_B_EMAIL,
        password: USER_B_ORIGINAL_PASSWORD,
        name: USER_B_ORIGINAL_NAME,
      },
    });
    expect(registerB.statusCode).toBe(201);

    // Bの操作前の実際の行を読み取っておく(name・password_hashともに)。
    // 後で「変化していないこと」をbyte-for-byteで比較するための基準値。
    const userBBefore = await AuthRepository.findByEmail(USER_B_EMAIL);
    expect(userBBefore).not.toBeNull();
    const userBId = userBBefore!.id;
    const userBNameBefore = userBBefore!.name;
    const userBPasswordHashBefore = userBBefore!.password_hash;
    expect(userBNameBefore).toBe(USER_B_ORIGINAL_NAME);

    // --- ユーザーAとしてログイン ---
    const loginA = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: USER_A_EMAIL, password: USER_A_ORIGINAL_PASSWORD },
    });
    expect(loginA.statusCode).toBe(200);
    const cookieA = sessionCookieFrom(loginA);

    // --- ユーザーAとして表示名変更を要求 ---
    const updateNameRes = await app.inject({
      method: "PATCH",
      url: "/profile/name",
      headers: { cookie: cookieA },
      payload: { name: USER_A_NEW_NAME },
    });
    expect(updateNameRes.statusCode).toBe(200);

    // --- ユーザーAとしてパスワード変更を要求 ---
    const changePasswordRes = await app.inject({
      method: "PATCH",
      url: "/profile/password",
      headers: { cookie: cookieA },
      payload: {
        currentPassword: USER_A_ORIGINAL_PASSWORD,
        newPassword: USER_A_NEW_PASSWORD,
      },
    });
    expect(changePasswordRes.statusCode).toBe(200);

    // --- one step further: 要求者本人(A)には期待通り反映されている ---
    const userAAfter = await AuthRepository.findByEmail(USER_A_EMAIL);
    expect(userAAfter!.name).toBe(USER_A_NEW_NAME);

    // Aは新パスワードでログインできる
    const loginANewPassword = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: USER_A_EMAIL, password: USER_A_NEW_PASSWORD },
    });
    expect(loginANewPassword.statusCode).toBe(200);

    // Aはもう旧パスワードではログインできない
    const loginAOldPassword = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: USER_A_EMAIL, password: USER_A_ORIGINAL_PASSWORD },
    });
    expect(loginAOldPassword.statusCode).toBe(401);

    // --- 本題(Requirement 7.1): ユーザーBの行はnameもpassword_hashも
    // 一切変化していない ---
    const userBAfter = await AuthRepository.findById(userBId);
    expect(userBAfter!.name).toBe(userBNameBefore);
    expect(userBAfter!.name).toBe(USER_B_ORIGINAL_NAME);

    const userBPasswordHashAfter = await AuthRepository.findPasswordHashById(
      userBId
    );
    expect(userBPasswordHashAfter).toBe(userBPasswordHashBefore);

    // one step further: Bは元のパスワードのままで引き続きログインできる
    // (Aの操作によってBのパスワードが書き換わっていた場合、ここで検出される)
    const loginBStillWorks = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: USER_B_EMAIL, password: USER_B_ORIGINAL_PASSWORD },
    });
    expect(loginBStillWorks.statusCode).toBe(200);
  });
});
