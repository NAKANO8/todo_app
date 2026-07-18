# Brief: task-status-model

## Problem
現状のTodoは`status`が未完了/完了の2値（`number`型のフラグ）しかなく、「着手しているが進んでいない」「他者の対応待ちでブロックされている」といった状態を表現できない。GitHub issue #60「Overhaul of status management」として既に課題化されている。この2値モデルのままでは、`task-rot-detection`が「動きが止まっている」を判定する際に、単純未完了タスクと着手済みタスクを区別できず、`redmine-integration`もRedmine側の多段階ステータス（新規/進行中/解決/却下等）を表現できない。

## Current State
`todos`テーブルの`status`は`number`型で、実質的に未完了/完了の2値としてのみ使われている（`todo-api/src/types/domain.types.ts`の`Todo`型参照）。フロントエンドのTodoApp.tsxもチェックボックスのon/offのみを扱う。

## Desired Outcome
Todoのステータスが、未完了/完了の2値から、`pending`（未着手）/`in_progress`（進行中）/`blocked`（ブロック中）/`done`（完了）の4値enumに拡張される。`blocked`は「止まっている理由を正直に報告できる」状態として導入し、担当者・グループリーダーが「何がブロックしているか」を確認しに行くトリガーとして使う。既存のチェックボックスUIとの後方互換性（「完了」への遷移は変わらず可能）を保ちながら、`task-rot-detection`と`redmine-integration`が消費できるステータス値を提供する。

## Approach
`status`を`number`型からenum型（`pending`/`in_progress`/`blocked`/`done`、Prisma移行後は`enum`定義）に変更する。既存データは全て`pending`または`done`相当の新enum値に移行するマイグレーションを実施する。UIはインボックス/進行中/完了の3カラム（またはセクション）レイアウトを想定し、チェックボックス化（ボタン→checkboxへ変更）を含む。大規模なUI刷新（カンバンのドラッグ&ドロップ等）はスコープ外とする。

## Scope
- **In**: ステータスenumの再設計（値の確定）、既存データのマイグレーション、API（作成・更新）でのステータス値の受け渡し、最小限のUI更新（状態選択）
- **Out**: ステータス遷移のワークフロー制御（特定の状態からしか遷移できない等のルール）、ステータス変更履歴の記録、大規模なUI刷新（カンバンビュー等）

## Boundary Candidates
- ステータスenumの値定義（`task-rot-detection`と`redmine-integration`の両方が依存するため、ここで確定させる）
- 既存データのマイグレーション
- API/UIでのステータス値の受け渡し

## Out of Boundary
- ステータス変更の監査ログ
- カンバン等のビュー刷新

## Upstream / Downstream
- **Upstream**: `orm-migration`（Prisma移行後のスキーマ変更として実施）
- **Downstream**: `task-rot-detection`（腐敗信号の判定にステータスを利用する可能性）、`redmine-integration`（Redmineのステータスとのマッピングに利用）

## Existing Spec Touchpoints
- **Extends**: なし（Todo CRUD機能自体は既存の暗黙的な範囲だが、独立したspecとして切る）
- **Adjacent**: `frontend-screen-tests`（Todo一覧UIのテストに影響する可能性）

## Constraints
- 既存の未完了/完了の判定ロジック（フィルタ・カウント等）を壊さないこと
- Prisma移行（`orm-migration`）完了後に着手すること
- ステータスのenum値は、後続の`task-rot-detection`・`redmine-integration`が確定後に値の意味を変更しない前提で設計すること
