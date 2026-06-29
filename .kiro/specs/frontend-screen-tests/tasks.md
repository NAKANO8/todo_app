# Implementation Plan

- [x] 1. 5つのテストファイルの実装
- [x] 1.1 (P) LandingPage のテストファイルを作成する
  - `features/landing/_test_/LandingPage.test.tsx` を新規作成する
  - `next/link` をモックし、LandingPage をレンダリングして heading と 2つのナビゲーションリンクを検証する
  - `pnpm test` 実行時に LandingPage の 3件のテストが全て PASS する
  - _Requirements: 1.1, 1.2, 1.3_
  - _Boundary: LandingPage.test.tsx_

- [x] 1.2 (P) LoginForm のテストファイルを作成する
  - `features/auth/_test_/LoginForm.test.tsx` を新規作成する
  - ログインモード（2.1〜2.7）と新規登録モード（3.1、3.2）の両方のケースを記述する
  - バリデーションエラーは `userEvent.type` → submit 後に `screen.getByText` で確認する
  - `pnpm test` 実行時に LoginForm の 9件のテストが全て PASS する
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2_
  - _Boundary: LoginForm.test.tsx_

- [x] 1.3 (P) CompleteTodos のテストファイルを作成する
  - `components/todo/_test_/CompleteTodos.test.tsx` を新規作成する
  - モックなしで `todos` props と `onClickBack` コールバックを検証する
  - `pnpm test` 実行時に CompleteTodos の 3件のテストが全て PASS する
  - _Requirements: 5.1, 5.2, 5.3_
  - _Boundary: CompleteTodos.test.tsx_

- [x] 1.4 (P) IncompleteTodos のテストファイルを作成する
  - `components/todo/_test_/IncompleteTodos.test.tsx` を新規作成する
  - モックなしで `todos` props と `onClickComplete`・`onClickDelete` コールバックを検証する
  - `pnpm test` 実行時に IncompleteTodos の 4件のテストが全て PASS する
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Boundary: IncompleteTodos.test.tsx_

- [x] 1.5 (P) TodoApp のテストファイルを作成する
  - `features/todo/_test_/TodoApp.test.tsx` を新規作成する
  - `@/lib/api/todos` と `react-toastify` をモックし、`waitFor` を使った非同期アサーションを記述する
  - `fetchTodos` の `mockResolvedValueOnce` チェーンで create 後の fetch refresh パターンを再現する
  - 5件上限テストでは fetchTodos に 5件の未完了 Todo を返させ、追加ボタンの無効化と警告メッセージを確認する
  - `pnpm test` 実行時に TodoApp の 7件のテストが全て PASS する
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - _Boundary: TodoApp.test.tsx_

- [x] 2. テストスイート全体の統合確認
- [x] 2.1 全テストを実行して 26件全件 PASS を確認する
  - `pnpm test` を実行し、5つの新規テストファイルと既存の `InputTodo.test.tsx` が全て PASS することを確認する
  - 新規テスト 26件が全て PASS し、失敗・スキップが 0件であること
  - _Depends: 1.1, 1.2, 1.3, 1.4, 1.5_
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4_
