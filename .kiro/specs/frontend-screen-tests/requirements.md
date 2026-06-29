# Requirements Document

## Introduction
フロントエンド開発チームは、既存の5つの画面コンポーネント（LandingPage、LoginForm、TodoApp、CompleteTodos、IncompleteTodos）に対してテストが存在しないため、リグレッションの検知が困難な状態にある。本スペックでは、これら5コンポーネントのユーザー観点での動作を自動検証するテストスイートを整備する。各テストはコンポーネントのレンダリング、ユーザーインタラクション、および状態変化を検証する。

## Boundary Context
- **In scope**: LandingPage、LoginForm（login/register両モード）、TodoApp、CompleteTodos、IncompleteTodos の各テストファイル
- **Out of scope**: InputTodo（既にテスト済み）、`app/*/page.tsx` ラッパー（ロジックなし）、ブラウザ上でのE2Eテスト、バックエンドAPIのテスト
- **Adjacent expectations**: テスト実行時、外部APIサーバーへの実際の通信は発生しない（外部APIモジュールはテストスコープ外として扱われる）

## Requirements

### Requirement 1: LandingPage テストカバレッジ

**Objective:** 開発者として、LandingPage のレンダリングとナビゲーション要素が正しいことを自動検証したい。なぜなら、ランディングページのリグレッションを早期に検知できるから。

#### Acceptance Criteria
1. When LandingPage is rendered, the LandingPage component shall display the heading text "シンプルさこそ便利さ。"
2. When LandingPage is rendered, the LandingPage component shall display a navigation link to "/login"
3. When LandingPage is rendered, the LandingPage component shall display a navigation link to "/register"

---

### Requirement 2: LoginForm ログインモード テストカバレッジ

**Objective:** 開発者として、LoginForm（ログインモード）のUI表示とクライアントサイドバリデーションが正しく機能することを自動検証したい。

#### Acceptance Criteria
1. When LoginForm is rendered with login mode, the LoginForm component shall display the title "ログイン"
2. When LoginForm is rendered with login mode, the LoginForm component shall display email and password input fields and a submit button
3. When the form is submitted with an empty email field, the LoginForm component shall display the error message "メールアドレスを入力してください!"
4. When the form is submitted with an incorrectly formatted email, the LoginForm component shall display the error message "メールの形式が正しくありません"
5. When the form is submitted with an empty password field, the LoginForm component shall display the error message "パスワードを入力してください!"
6. When the form is submitted with a password that does not meet the strength requirements, the LoginForm component shall display the error message "8文字以上・大文字1つ・数字1つ以上が必要です"
7. When LoginForm is rendered with login mode, the LoginForm component shall display a link to "/register"

---

### Requirement 3: LoginForm 新規登録モード テストカバレッジ

**Objective:** 開発者として、LoginForm（新規登録モード）がログインモードと異なるUI（タイトル・リンク先）を表示することを自動検証したい。

#### Acceptance Criteria
1. When LoginForm is rendered with register mode, the LoginForm component shall display the title "新規登録"
2. When LoginForm is rendered with register mode, the LoginForm component shall display a link to "/login"

---

### Requirement 4: TodoApp テストカバレッジ

**Objective:** 開発者として、TodoApp の初期読み込み・CRUD操作・5件上限ルールが正しく機能することを自動検証したい。

#### Acceptance Criteria
1. When TodoApp is rendered, the TodoApp component shall display the todo titles retrieved from the external service
2. When the user types a todo title and clicks the add button, the TodoApp component shall display the new todo in the incomplete todos section
3. When the user clicks the complete button on an incomplete todo, the TodoApp component shall move that todo from the incomplete section to the completed section
4. When the user clicks the delete button on an incomplete todo, the TodoApp component shall remove that todo from the displayed list
5. When the user clicks the back button on a completed todo, the TodoApp component shall move that todo from the completed section to the incomplete section
6. While the incomplete todo count reaches 5, the TodoApp component shall disable the add button and display the message "登録できるTodoは5個までです"
7. If the add button is disabled and the user clicks it, the TodoApp component shall not add a new todo to the list

---

### Requirement 5: CompleteTodos テストカバレッジ

**Objective:** 開発者として、CompleteTodos コンポーネントが完了TODOリストと「戻す」ボタンを正しく表示し、操作を親コンポーネントへ委譲することを自動検証したい。

#### Acceptance Criteria
1. When CompleteTodos is rendered with a list of completed todos, the CompleteTodos component shall display each todo's title
2. When CompleteTodos is rendered with an empty list, the CompleteTodos component shall display no todo items
3. When the user clicks the "戻す" button for a todo, the CompleteTodos component shall invoke the back action callback with that todo's id

---

### Requirement 6: IncompleteTodos テストカバレッジ

**Objective:** 開発者として、IncompleteTodos コンポーネントが未完了TODOリストと操作ボタンを正しく表示し、操作を親コンポーネントへ委譲することを自動検証したい。

#### Acceptance Criteria
1. When IncompleteTodos is rendered with a list of incomplete todos, the IncompleteTodos component shall display each todo's title
2. When IncompleteTodos is rendered with an empty list, the IncompleteTodos component shall display no todo items
3. When the user clicks the "完了" button for a todo, the IncompleteTodos component shall invoke the complete action callback with that todo's id
4. When the user clicks the "削除" button for a todo, the IncompleteTodos component shall invoke the delete action callback with that todo's id
