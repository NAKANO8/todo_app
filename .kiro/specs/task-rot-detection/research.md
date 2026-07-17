# Research & Design Decisions Template

## Summary
- **Feature**: `task-rot-detection`
- **Discovery Scope**: New Feature（既存のTodo CRUD機能への拡張だが、依存するグループ/ロール・ステータスenum・担当者の基盤自体が本spec時点では未実装のため、実質的にグリーンフィールド設計として扱う）
- **Key Findings**:
  - 現行コードベース（`todo-api`）は生SQL（`mysql2`）・単純な`status: number`フィールドで、腐敗判定に必要な状態（着手ラグの起点、blocked理由、ヘルプ状態、見積もり）を保持する列が一切存在しない。本specの実装着手時点では`orm-migration`によりPrisma化されている前提で設計する
  - 腐敗レベル・通知要否・可視性はすべて既存データ（`due_date`・タイムスタンプ・ステータス）から導出可能な**派生値**であり、通知の配信状態や可視性フラグを独立して永続化する必要はない（既存の「サーバー側で真実を持つ」方針=認可ガードがサーバー専用である設計と同じ考え方）
  - 「ヘルプ放置時のリーダーへの腐敗連鎖」は、新しいTodoレコードを作らず、同じ腐敗計算ロジックを`help_requested_at`起点・短いしきい値で再適用するだけで実現できる（軸Bの汎化）

## Research Log

### 既存Todoドメインとレイヤー構成
- **Context**: File Structure Planを書くために、現行の`todo-api`/`todo-web`のレイヤー構成と命名規則を確認
- **Sources Consulted**: `todo-api/src/repositories/todos.repository.ts`, `todo-api/src/services/todos.service.ts`, `.kiro/steering/structure.md`, `.kiro/steering/tech.md`
- **Findings**:
  - レイヤーは`routes → controllers → services → repositories → types`で固定。命名は`<domain>.<layer>.ts`
  - `TodoRepository`は生SQL（`pool.query`）、`user_id`スコープが必須。`orm-migration`完了後はPrisma Clientベースに置換される予定（API挙動は変えない制約）
  - フロントは`features/todo`・`components/todo`・`lib/`の構成。通知は`react-toastify`が既に導入済み（トースト＝閉じたら終わりの一過性UI）
- **Implications**: 本specの新規ファイルもこのレイヤー命名規則に従う。DBアクセスはPrisma移行後の`TodoRepository`を拡張する前提で書き、生SQLは対象にしない

### 通知配信の実現方式（サーバープッシュ vs 派生値+ポーリング）
- **Context**: 「消しても再出現する」「放置時間に応じて間隔短縮」という要件を、現行スタックでどう実現するか
- **Sources Consulted**: `.kiro/steering/tech.md`（Key Libraries: `@fastify/session`, `@fastify/rate-limit`, `react-toastify`。WebSocket/push基盤なし）
- **Findings**: 現行スタックにWebSocket/SSE/ジョブキューの基盤がない。腐敗レベルは`due_date`等の既存データから任意の時点で再計算できる純粋関数であるため、サーバープッシュを新設する必然性がない
- **Implications**: 腐敗レベルはAPIリクエスト時にサーバー側で算出して返す派生フィールドとし、フロントは定期ポーリング（間隔は現在の腐敗レベルに応じてクライアント側で調整）で再取得する設計を採用する。新規インフラ（WebSocketサーバー、ジョブキュー）は導入しない

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| サーバー側で腐敗レベルを算出し派生フィールドとして返す（採用） | `RotCalculator`をservice層に置き、Todo取得時に都度計算 | 可視性判定と同じく「サーバーが真実を持つ」既存方針と一貫。フロント側の二重実装・時計のずれを防ぐ | ポーリング頻度によっては軽い負荷増（許容範囲、キャッシュ不要な軽量計算） | 既存の`middleware.ts`が`/auth/me`をサーバーに問い合わせる設計と同じ思想 |
| クライアント側で腐敗レベルを算出（不採用） | フロントが`due_date`等の生データを受け取り自前で計算 | リクエスト数を減らせる | ロジックをAPI/Web両方に二重実装する必要があり、クライアントの時計・タイムゾーンのずれに影響される。可視性判定（Req 9.4のようにユーザーが操作できない前提）とも矛盾しやすい | 不採用 |
| WebSocketでリアルタイムpush（不採用） | サーバーが腐敗レベル変化を能動的に通知 | 通知の即時性が高い | 現行スタックに基盤がなく、本specのためだけに新規インフラを導入するのは過剰（Simplification原則に反する） | 将来グループチャット機能で必要になれば再検討 |

## Design Decisions

### Decision: 腐敗レベルはサーバー側の派生フィールドとして提供する
- **Context**: 通知・色表示・可視性のすべてが「本人が操作できない機械的な軸」であることが要件の核（EARS 2, 3, 6, 9）
- **Alternatives Considered**:
  1. クライアント側で`due_date`等から都度計算
  2. サーバー側で算出しAPIレスポンスに含める
- **Selected Approach**: 2。`RotCalculator`ドメインサービスが`due_date`・`createdAt`・`lastDecisionActionAt`・`blockedReviewAt`等を入力に腐敗レベル（`healthy`/`mild`/`moderate`/`severe`）を返す純粋関数を持ち、Todo一覧/詳細APIのレスポンスに`rotLevel`として含める
- **Rationale**: 既存の「認可はサーバー専用、クライアントを信用しない」方針と一貫させられる。ロジックの二重実装を避けられる
- **Trade-offs**: フロントはポーリングで再取得する必要があり、厳密なリアルタイム性はない（通知3段階の要件は「間隔を短縮する」であり即時性までは要求していないため許容）
- **Follow-up**: ポーリング間隔の具体値は実装時にUXと負荷のバランスで調整

### Decision: 軸A・軸Bを1つの`RotCalculator`に統合し、ヘルプエスカレーションにも再利用する
- **Context**: 締切比率（軸A）・着手ラグ（軸B）・ヘルプ放置時のリーダーへの腐敗連鎖（EARS 8.2）は、いずれも「起点からの経過時間としきい値」で段階を決めるという同型の計算
- **Alternatives Considered**:
  1. 軸A・軸B・ヘルプエスカレーションをそれぞれ個別に実装
  2. 経過時間としきい値集合を入力に段階を返す汎用関数を1つ作り、3箇所で異なるしきい値を渡して再利用
- **Selected Approach**: 2。`LagStageCalculator(elapsedMs, thresholds) -> RotLevel`を共通コアとし、軸A（残り時間比率をelapsedとして正規化）・軸B（作成〜最終意思決定アクション）・ヘルプ対応SLA（`help_requested_at`起点、短い固定しきい値）がそれぞれこの共通コアを異なるしきい値で呼び出す
- **Rationale**: Generalization原則。個別実装だと3箇所でしきい値判定ロジックが重複し、将来のしきい値調整のたびに3箇所を直す必要が生まれる
- **Trade-offs**: 共通コアの抽象化が1段階増えるが、しきい値の意味が異なるだけで判定の形は同一なので抽象化コストは小さい
- **Follow-up**: 具体的なしきい値（軽度/中度/重度の境界、ヘルプSLAの固定猶予時間）は実装時に決定（brief.mdのConstraints参照）

### Decision: 可視性・通知の状態は新規テーブルを作らず、Todoの既存/追加カラムから導出する
- **Context**: ヘルプ状態、blocked緩和、見積もり承認など、複数の「状態」が絡むが、いずれも1タスクにつき同時に1つのアクティブ状態しか持たない
- **Alternatives Considered**:
  1. `HelpRequest`・`Notification`・`EstimateApproval`をそれぞれ独立したテーブルにする
  2. Todoテーブルへのカラム追加（`help_requested_at`, `blocked_reason`, `blocked_review_at`, `estimate_minutes`, `estimate_approval_status`, `last_decision_action_at`）で表現し、可視性・通知要否はAPIレスポンス生成時にこれらから導出する
- **Selected Approach**: 2
- **Rationale**: Simplification原則。履歴保持（Out of Boundary: ステータス変更履歴・アサイン変更履歴は対象外）が不要なため、正規化された別テーブルにする理由がない
- **Trade-offs**: 将来「ヘルプ発火の履歴を残したい」等の要件が出た場合はテーブル分離が必要になるが、現行要件には含まれない
- **Follow-up**: なし

## Risks & Mitigations
- 上流spec（`team-management`/`task-status-model`/`task-assignment`）が未設計のため、`group_id`・ステータスenumの正確な値・`assignee_id`の型が本designでは仮定に留まる — Allowed Dependenciesに明記し、上流specの設計確定時にRevalidation Triggerとして再検証する
- 「意思決定アクション（着手・却下・計画）」が`task-status-model`の4値ステータスと1対1に対応しない（「却下」に対応するステータス値がない）— 本specが独自に「意思決定アクションの記録」という概念を持つことで解決するが、`task-status-model`の設計時に語彙の整合を再確認する必要がある
- ポーリングベースの通知は、ブラウザタブを長時間開いたままにしないと「間隔短縮」が体感されない — 許容するが、実装時にページ再訪時の即時再計算で緩和する

## References
- （本specは内部ドメインロジックが中心のため外部標準・ライブラリの新規調査なし。既存steering: `.kiro/steering/tech.md`, `.kiro/steering/structure.md`を参照）
