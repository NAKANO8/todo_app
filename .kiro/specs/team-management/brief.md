# Brief: team-management

## Problem
チームでこのアプリを使いたい管理者・グループリーダーは、現状「誰が同じグループに属するか」「グループ単位でメンバーの状況を把握する」手段を持たない。`role`は`admin`/`member`の2値しかなく、システム全体の管理者権限と、チーム内でメンバーを見守る権限が区別されていない。

## Current State
`users`テーブルには`role`（`admin`/`member`）と`status`（有効/無効）のみが存在し、グループやチームという概念自体がない。`admin-role` spec作成時点（2026-07-01）で「`group_leader`はグループ機能実装時に追加する」ことが明記され、`role`カラムはenum拡張に耐える設計になっている。`admin-user-management` specでも「グループ/チーム単位のアクセス制御は別イテレーションで扱う」と明記されており、本specがそれに当たる。

## Desired Outcome
グループ（チーム）という単位が導入され、ユーザーはいずれかのグループに所属する。`group_leader`ロールを持つユーザーは、自分が率いるグループのメンバー一覧と、各メンバーの状態を把握できる。ただし本specはグループ・メンバーシップ・可視性の権限基盤のみを提供し、実際に何を見せるか（腐敗信号など）は`task-rot-detection`specの責務とする。

## Approach
`groups`テーブルとメンバーシップ（`users.group_id`または中間テーブル）を追加し、`role`のenumに`group_leader`を追加する。グループの作成・メンバーの追加/削除は`admin`権限を持つユーザーが行う。`group_leader`は自グループのメンバー一覧を参照できるが、他グループのメンバーは参照できない。

## Scope
- **In**: `groups`テーブルとメンバーシップの追加、`role`への`group_leader`追加、管理者によるグループ作成・メンバー割り当て、`group_leader`による自グループメンバー一覧の参照、グループスコープの認可（自グループ外のメンバー情報にアクセスできないこと）
- **Out**: グループごとのTodo内容の可視化（`task-rot-detection`の責務）、1ユーザーが複数グループに所属するケース、グループの階層構造（グループのグループ等）、グループ単位の詳細な権限カスタマイズ（read/manage分離、`admin-role` spec時点で将来検討とされていたもの）

## Boundary Candidates
- グループのCRUD（作成・名称変更・削除は`admin`のみ）
- メンバーシップの割り当て・解除
- `group_leader`による自グループメンバー一覧の参照API
- グループスコープの認可ミドルウェア/ガード

## Out of Boundary
- Todoの内容やステータスをグループリーダーに見せる機能は本specでは扱わない（`task-rot-detection`が消費する可視性の「土台」だけをここで作る）
- 複数グループ所属、グループ階層は対象外
- グループ単位でTodoの可視性ポリシーを`group_leader`が設定できるようにする機能は対象外。可視性（グループ内は全員公開）は製品として固定された方針であり、`group_leader`の権限は運用操作（メンバー管理等）に限定される（`task-rot-detection`参照、2026-07-16確定）

## Upstream / Downstream
- **Upstream**: `orm-migration`（Prisma移行後のスキーマ変更として実施）、`admin-role`（`role`カラムを拡張）、`admin-user-management`（既存の管理者画面にグループ管理UIを追加する可能性）
- **Downstream**: `task-assignment`（グループメンバーの集合を担当者候補として利用する）、`task-rot-detection`（グループスコープの認可基盤を利用して腐敗信号をメンバー全員に表示する）

## Existing Spec Touchpoints
- **Extends**: `admin-role`（`role`のenumに`group_leader`を追加）、`admin-user-management`（管理者画面にグループ管理機能を追加する可能性があるが、既存UIの破壊的変更は行わない）
- **Adjacent**: `session-invalidation`（グループからの除外時にセッション強制ログアウトが必要かは設計フェーズで検討）

## Constraints
- 既存の`admin`/`member`の挙動・認可ルールを壊さないこと
- Prisma移行（`orm-migration`）完了後に着手すること
