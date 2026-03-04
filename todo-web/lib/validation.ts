export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const passwordRegex = /^(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/;

export const validateEmail = (email: string): string | null => {
  if (!email) return "メールアドレスを入力してください!";
  if (!emailRegex.test(email)) return "メールの形式が正しくありません";
  return null
}

export const validatePassword = (password: string): string | null => {
  if (!password) return "パスワードを入力してください!";
  if (!passwordRegex.test(password)) return "8文字以上・大文字1つ・数字1つ以上が必要です";
  return null
}
