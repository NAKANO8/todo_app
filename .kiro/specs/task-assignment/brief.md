# Brief: task-assignment

## Problem
グループでTodoを運用するメンバー・group_leaderは、タスクを特定の担当者に割り当てる手段を持たない。誰が対応すべきかが曖昧なままタスクが放置される原因になり得る。`task-rot-detection`の可視性ルール（アサインされたグループタスクは作成時点から公開／個人発案タスクはデフォルト非公開）も、「アサインされているかどうか」を機械的に判定する情報源を必要とするが、現状その情報が存在しない。

## Current State
Todoには担当者の概念がなく、作成者以外の誰かに紐づける手段がない。`team-management`（未実装）が提供するグループ・メンバーシップの情報も、まだ担当者候補の集合として消費できる形になっていない。

## Desired Outcome
Todoに担当者（1タスクにつき1人）を設定できるようになる。担当者候補は、そのタスクが属するグループのメンバーに限定される。この担当者情報は、`task-rot-detection`が「アサインされたグループタスク」と「個人発案タスク」を区別するための判定材料として利用される。

## Approach
Todoに`assignee_id`（nullable、`users`への参照）を追加する。グループに属するタスクの作成・編集時に、そのグループのメンバー一覧（`team-management`が提供）から担当者を選択できるようにする。自分自身を担当者に設定すること（自己アサイン）も許可する。

## Scope
- **In**: 担当者（`assignee_id`）フィールドの追加、タスク作成・編集時の担当者選択、担当者候補をタスクが属するグループのメンバーに限定する制約、自己アサインの許可
- **Out**: 1タスクへの複数担当者の割り当て、担当者の変更履歴・監査ログ、担当者へのアサイン通知（`task-rot-detection`の通知機能と別軸のため対象外）、承認を要するアサイン変更ワークフロー

## Boundary Candidates
- `assignee_id`フィールドの追加とマイグレーション
- API/UIでの担当者選択（候補はグループメンバーに限定）
- 担当者候補の集合をグループメンバーシップから解決するロジック

## Out of Boundary
- 複数担当者・アサイン履歴の記録
- アサイン変更時の通知（`task-rot-detection`側の責務として検討）

## Upstream / Downstream
- **Upstream**: `orm-migration`（Prisma移行後のスキーマ変更として実施）、`team-management`（担当者候補となるグループメンバーシップ情報を提供）、`task-status-model`（`TodoRepository.create`/`update`の`status`引数を共通で拡張するため、その型定義に従う）
- **Downstream**: `task-rot-detection`（「アサインされたグループタスク」の可視性判定に本specの担当者情報を利用する）

## Existing Spec Touchpoints
- **Extends**: なし（Todo CRUD機能への属性追加）
- **Adjacent**: `team-management`（メンバー一覧取得APIに依存）、`redmine-integration`（Redmine連携で取り込まれたTodoに担当者を設定するかは設計フェーズで検討）

## Constraints
- `team-management`・`task-status-model`の完了後に着手すること
- 担当者候補は、タスクが属するグループのメンバーに限定すること（グループ外のユーザーをアサインできない）
- グループに所属しない個人利用者は、アサイン先候補が存在しないためアサイン機能自体を使用できない
