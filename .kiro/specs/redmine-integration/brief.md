# Brief: redmine-integration

## Problem
開発チームは既にRedmineでチケット管理を行っているが、日々の細かいタスク（このアプリが担う領域）とRedmineのチケットが分断されている。Redmineのチケットに対応するTodoを手動で作り直す手間が発生している。GitHub issue #61「Integration with Redmine」として課題化されている。

## Current State
外部システムとの連携機能は一切存在しない。Todoは`title`と`status`のみを持ち、外部チケットへの参照フィールドもない。

## Desired Outcome
Redmineのチケットを起点として、対応するTodoが自動的に作成される（一方向連携: Redmine→Todo）。Todo側からRedmineチケットへの手動更新の反映（双方向同期）は行わない。Todoのステータスは`task-status-model`で確定するenum値とRedmine側のステータスをマッピングして初期反映する。

## Approach
Redmineの認証情報（APIキー等）をユーザーまたはグループ単位で登録できるようにし、定期的（ポーリング）または手動トリガーでRedmineチケットを取得し、未取り込みのチケットに対応するTodoを作成する。取り込み後のTodo側の編集はRedmineに反映しない。

## Scope
- **In**: RedmineのAPIキー登録・接続設定、チケット取得とTodo自動作成（一方向）、Redmineステータスと`task-status-model`のステータスのマッピング、重複取り込み防止（同じチケットから複数Todoを作らない）
- **Out**: Todo→Redmineへの双方向同期、Redmine以外の外部トラッカーとの連携、リアルタイムWebhook連携（初期はポーリングのみ）、Git/PRとの連携（検討したが撤回）

## Boundary Candidates
- Redmine接続設定（APIキー管理）
- チケット取得・Todo自動作成バッチ処理
- ステータスマッピング定義

## Out of Boundary
- Todo側の変更をRedmineに書き戻す機能
- Redmine以外のトラッカー（Jira等）への対応

## Upstream / Downstream
- **Upstream**: `task-status-model`（Redmineステータスとのマッピング先となるenum値を確定させる必要がある）
- **Downstream**: なし

## Existing Spec Touchpoints
- **Extends**: なし
- **Adjacent**: `task-rot-detection`（Redmine連携で作成されたTodoも腐敗判定の対象に含めるかは設計フェーズで検討）

## Constraints
- RedmineのAPIキー等の認証情報は暗号化して保存すること
- `task-status-model`完了後に着手すること
- 初期スコープは一方向連携に限定し、双方向同期は将来の拡張として扱う
