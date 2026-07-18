# Requirements Document

## Project Description (Input)
現状のTodoは`status`が未完了/完了の2値（`number`型のフラグ）しかなく、「着手しているが進んでいない」「他者の対応待ちでブロックされている」といった状態を表現できない（GitHub issue #60「Overhaul of status management」）。この2値モデルのままでは、後続の`task-rot-detection`が「動きが止まっている」を判定する際に単純未完了タスクと着手済みタスクを区別できず、`redmine-integration`もRedmine側の多段階ステータスを表現できない。

本機能では、Todoのステータスを`pending`（未着手）/`in_progress`（進行中）/`blocked`（ブロック中）/`done`（完了）の4値enumに拡張する。`orm-migration`完了後のPrismaスキーマ（`Todo.status: Boolean`）を拡張し、既存データを新enum値へ安全に移行する。既存のチェックボックスUIとの後方互換性（完了への遷移は変わらず可能）を保ちながら、`task-rot-detection`と`redmine-integration`が消費できる安定したステータス値を提供する。

## Introduction
現行の`todos`テーブルの`status`は`number`型（0/1）の2値フラグとして扱われており、未完了/完了しか区別できない。本機能は、この`status`を`pending`/`in_progress`/`blocked`/`done`の4値enumへ拡張し、着手状況とブロック状態を区別可能にする。既存データは矛盾なく新enumへ移行し、既存のチェックボックスによる完了/未完了操作や、アクティブTodoの5件制限などの既存ロジックは壊さない。確定するenum値と意味は、後続の`task-rot-detection`（腐敗信号判定）および`redmine-integration`（Redmineステータスとのマッピング）が前提として利用するため、本機能完了後は値の意味を変更しない。

## Boundary Context (Optional)
- **In scope**: ステータスenum(`pending`/`in_progress`/`blocked`/`done`)の値定義確定、既存データ（`status`0/1）の新enumへの移行、Todo作成・更新API経由でのenum値の受け渡し、既存チェックボックス操作との後方互換性、未完了Todoに対するステータス（pending/in_progress/blocked）の最小限の可視化・切替UI
- **Out of scope**: ステータス遷移のワークフロー制御（特定の状態からしか遷移できない等のルール）、ステータス変更履歴の監査ログ、カンバンビュー等の大規模なUI刷新、`blocked`理由・次回見直し予定日時等の付随メタデータ（`task-rot-detection`の責務）、担当者・グループに基づく可視性制御（`team-management`/`task-assignment`の責務）
- **Adjacent expectations**: `task-rot-detection`（要件・設計承認済み、実装未着手）と`redmine-integration`は、本機能が確定する4値のenum値とその意味をそのまま前提として消費する。本機能は`orm-migration`完了後のPrismaスキーマ（`Todo.status: Boolean`）を拡張する前提であり、`orm-migration`のリポジトリ層公開シグネチャ（`findAll`/`findById`/`create`/`update`/`delete`）は変更しない。

## Requirements

### Requirement 1: ステータスenum値の確定と初期値
**Objective:** As a プロダクトオーナー, I want Todoのステータスがpending/in_progress/blocked/doneの4値で表現される, so that 着手状況とブロック状態を区別でき、後続機能が一貫した値を利用できる

#### Acceptance Criteria
1. The Todo管理システム shall Todoのステータスをpending, in_progress, blocked, doneの4値のいずれかとして保持する。
2. When 新規Todoが作成される, the Todo管理システム shall 初期ステータスをpendingに設定する。
3. The Todo管理システム shall 永続化されるどのTodoのステータス値も、常に上記4値のいずれかに限定する。

### Requirement 2: 既存データの移行
**Objective:** As a 運用担当者, I want 既存Todoデータが新しいステータスenumへ安全に移行される, so that 移行後もデータの整合性が保たれ、既存の未完了/完了状態が失われない

#### Acceptance Criteria
1. When 既存データの移行が実行される, the データ移行処理 shall 移行前にstatus=0（未完了）だったTodoをpendingへ変換する。
2. When 既存データの移行が実行される, the データ移行処理 shall 移行前にstatus=1（完了）だったTodoをdoneへ変換する。
3. The データ移行処理 shall 移行の前後でTodoの件数を変化させない。
4. The データ移行処理 shall 移行の前後でどのTodoにも所有者（user_id）の変更を発生させない。

### Requirement 3: API経由のステータス更新
**Objective:** As a Todo利用者, I want APIでTodoのステータスを4値の中から更新できる, so that 進行中やブロック中であることを記録できる

#### Acceptance Criteria
1. When クライアントがTodo更新リクエストのstatusにpending, in_progress, blocked, doneのいずれかを指定する, the Todo API shall 指定された値でそのTodoのステータスを更新する。
2. If クライアントがTodo更新リクエストのstatusに4値以外の値を指定する, then the Todo API shall そのリクエストを拒否し400エラーを返す。
3. When クライアントが自分以外のユーザーが所有するTodoのステータス更新を試みる, the Todo API shall 既存の認可ルールに従って404エラーを返す。
4. The Todo API shall title等ステータス以外のフィールドの更新に関する既存の挙動を変更しない。

### Requirement 4: チェックボックス操作との後方互換性
**Objective:** As a Todo利用者, I want 既存のチェックボックス操作で完了/未完了を切り替えられる, so that ステータスモデルの拡張後も使い慣れた操作方法が失われない

#### Acceptance Criteria
1. When 利用者が未完了Todoに対して完了操作（チェックボックスのチェック相当）を行う, the Todo一覧画面 shall そのTodoのステータスをdoneに更新する。
2. When 利用者が完了済みTodoに対して未完了へ戻す操作を行う, the Todo一覧画面 shall そのTodoのステータスをpendingに更新する。
3. The Todo一覧画面 shall ステータスがdone以外（pending/in_progress/blocked）のTodoを「未完了」セクションに表示する。
4. The Todo一覧画面 shall ステータスがdoneのTodoのみを「完了済み」セクションに表示する。

### Requirement 5: 未完了Todoの最小限のステータス可視化と切替
**Objective:** As a Todo利用者, I want 未完了Todoが進行中やブロック中であることを確認・変更できる, so that 単純な二値では表現できない着手状況を把握できる

#### Acceptance Criteria
1. The Todo一覧画面 shall 未完了セクション内の各Todoについて、現在のステータス（pending/in_progress/blocked）を表示する。
2. When 利用者が未完了Todoのステータスをpending, in_progress, blockedの間で変更する, the Todo一覧画面 shall 変更後のステータスをTodo APIに送信し、画面表示に反映する。
3. Where 利用者がこのステータス切替UIを操作する, the Todo一覧画面 shall 完了操作用のチェックボックス操作とは別の手段として、この切替を提供する。

### Requirement 6: 既存の集計・件数制限ロジックの非破壊
**Objective:** As a Todo利用者, I want ステータスモデル拡張後も既存のTodo件数制限やフィルタ挙動が変わらない, so that 既存の利用体験が損なわれない

#### Acceptance Criteria
1. While 未完了（done以外）のTodoが5件に達している, the Todo一覧画面 shall 既存と同様に新規Todoの追加を制限する。
2. While 未完了のTodoが5件に達している状態で利用者が追加を試みた, the Todo一覧画面 shall 既存と同じ上限案内メッセージを表示する。
3. The Todo一覧画面 shall pending, in_progress, blockedのいずれのステータスであっても、そのTodoを未完了件数のカウント対象に含める。
