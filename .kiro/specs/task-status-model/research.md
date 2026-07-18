## Summary
- **Feature**: `task-status-model`
- **Discovery Scope**: Extension（既存Todo CRUDのステータスモデルを2値から4値enumへ拡張）
- **Key Findings**:
  - 現行の`status`はDB/API/フロントエンドの全層で`number`(0/1)として一貫して扱われており、拡張は「型を差し替える」形で閉じる。新規のドメイン概念の追加は不要。
  - `orm-migration`（`.kiro/specs/orm-migration/design.md`）はまだ実装されていないが、Prisma上で`Todo.status: Boolean @default(false)`を確定させており、本specはその上に新しいPrisma migrationを追加する形で拡張する。`TodoRepository`の公開シグネチャ（`findAll`/`findById`/`create`/`update`/`delete`）は不変。
  - `task-rot-detection`（要件・設計承認済み、ブランチ`spec/task-rot-detection`）は、本specが確定する`pending`/`in_progress`/`blocked`/`done`という値そのものと、`in_progress`/`blocked`への遷移を前提として消費する。`blocked_reason`/`blocked_review_at`/見積もり関連フィールドは`task-rot-detection`自身が所有し、本specの範囲外。

## Research Log

### 既存Todoステータス実装の分析
- **Context**: 後方互換性を壊さずに4値化するため、現行実装の全消費箇所を洗い出す。
- **Sources Consulted**: `todo-api/src/types/todo.ts`, `todo-api/src/repositories/todos.repository.ts`, `todo-api/src/services/todos.service.ts`, `todo-api/src/routes/todos.route.ts`, `todo-api/src/controllers/todos.controller.ts`, `todo-web/features/todo/TodoApp.tsx`, `todo-web/components/todo/ActiveTodos.tsx`, `todo-web/components/todo/DoneTodos.tsx`, `todo-web/lib/types.ts`, `todo-web/lib/api/todos.ts`
- **Findings**:
  - `status`は現在DB上`BOOLEAN`(実体`TINYINT(1)`)、API/フロントエンドでは`number`(0/1)として扱われる。
  - `TodoRepository.create(title, userId, status = 0)`はデフォルト値0（未完了）。`update()`は`Partial<Pick<Todo,"title"|"status">>`を受け取り、指定フィールドのみ更新する早期return方式。
  - Fastifyの`updateTodoSchema`は`status: { type: "integer", enum: [0, 1] }`でAPI境界のバリデーションを行っている。
  - フロントエンドは`TodoApp.tsx`で`activeTodos = todos.filter(t => t.status === 0)`、`doneTodos = todos.filter(t => t.status === 1)`と直接数値比較しており、`handleComplete`は`status: 1`、`handleRestore`は`status: 0`を送信する。5件の上限判定（`isAtCapacity`）は`activeTodos.length`基準。
  - `ActiveTodos.tsx`は「完了」「削除」ボタンのみ、`DoneTodos.tsx`は「戻す」ボタンのみで、ステータスの中間状態を表示・変更するUIは存在しない。
- **Implications**: 型変更は5ファイル程度に閉じる（BE: types/todo.ts, repository, service, route, controller / FE: lib/types.ts, TodoApp.tsx, ActiveTodos.tsx）。新たに必要なのは「未完了内でpending/in_progress/blockedを切り替える最小限のUI」のみで、既存のアクティブ/完了の二分ロジック自体は「done以外は未完了」という条件に置き換えるだけで温存できる。

### orm-migrationのPrismaスキーマとの整合性
- **Context**: 本specは`orm-migration`完了後のPrismaスキーマを拡張する前提のため、その設計を確認し矛盾がないか検証する。
- **Sources Consulted**: `.kiro/specs/orm-migration/design.md`（Components and Interfaces / Data Models節）
- **Findings**:
  - `orm-migration`は`Todo`モデルを`status Boolean @default(false)`、物理カラムを`BOOLEAN NOT NULL DEFAULT 0`として定義する。テーブル・カラムの物理名は`@@map`/`@map`で既存のスネークケースを維持する方針。
  - `TodoRepository`はPrisma Clientベースで実装されるが、`findAll(userId)`/`findById(id, userId)`/`create(title, userId, status?)`/`update(id, userId, data)`/`delete(id, userId)`という公開シグネチャ・戻り値の形・`userId`スコープの強制は変更しない契約になっている。
  - `orm-migration`のRevalidation Triggersには「`prisma/schema.prisma`のモデル・enum定義を変更する場合（後続spec全てが再検証対象）」が明記されており、本specがenumへ変更することはこの再検証対象に該当する想定内の変更である。
- **Implications**: 本specは`orm-migration`のベースラインマイグレーション（`0_init`）を変更せず、新しいPrisma migrationを追加してカラム型をBooleanからenumへ変更する。`TodoRepository`のメソッドシグネチャ自体は変えず、`status`パラメータ・戻り値の型のみを`boolean`/`number`から`TodoStatus`（文字列union）へ差し替える。

### task-rot-detectionの依存関係の確認
- **Context**: ロードマップ上、本specの直後に実装される`task-rot-detection`は要件・設計が承認済み（ブランチ`spec/task-rot-detection`）であり、本specが確定する値・契約が食い違わないことを事前に確認する必要がある。
- **Sources Consulted**: `git show spec/task-rot-detection:.kiro/specs/task-rot-detection/requirements.md`, `git show spec/task-rot-detection:.kiro/specs/task-rot-detection/design.md`
- **Findings**:
  - `task-rot-detection`は「ステータスenum（`pending`/`in_progress`/`blocked`/`done`）の値定義そのもの」を明示的に本spec（`task-status-model`）の責務とし、自身は`blocked`/`in_progress`への遷移イベントを消費するだけと明記している。
  - `task-rot-detection`のRevalidation Triggersには「`task-status-model`のenum値・遷移イベントの意味が変わったとき（特に「意思決定アクション」の対応付け）」が含まれる。
  - `blocked_reason`/`blocked_review_at`/`estimate_minutes`/`estimate_approval_status`等の付随フィールドは`task-rot-detection`自身が所有するフィールドであり、本specでは追加しない。
  - `task-rot-detection`は「着手・blockedへの遷移は`task-status-model`のステータス変更イベントを購読して自動記録する」という将来像を持つが、これはイベント配信基盤の実装を要求するものではなく、`task-rot-detection`側が自身の実装時に本specのAPI/データ変更を検知する設計上の前提に過ぎない。
- **Implications**: 本specは4値の名称・意味を確定させ、以後変更しないことをBoundary Commitments/Revalidation Triggersに明記する。イベントバスやWebhook等の配信機構は本specのスコープに含めない（`task-rot-detection`側が必要になった時点で、本specが提供するステータス値・更新APIを参照する設計とする）。

## Architecture Pattern Evaluation
既存のレイヤードアーキテクチャ（`routes → controllers → services → repositories → DB`、`orm-migration`が確立するPrisma Clientベースのリポジトリ層）をそのまま踏襲する拡張であり、新たなアーキテクチャパターンの選定は不要。検討したのはデータ移行方式のみ（下記Design Decisions参照）。

## Design Decisions

### Decision: 既存BooleanカラムからENUMへの移行方式
- **Context**: MySQLの`BOOLEAN`(`TINYINT(1)`)カラムを`ENUM('pending','in_progress','blocked','done')`へ変更しつつ、既存データ（`0`/`1`）を`pending`/`done`へ正確にマッピングする必要がある。
- **Alternatives Considered**:
  1. `ALTER TABLE todos MODIFY COLUMN status ENUM(...)`による単一ステップの直接型変換
  2. 新カラムを追加 → `CASE`式でバックフィル → 旧カラム削除 → 新カラムを`status`にリネーム、という明示的な4ステップ
- **Selected Approach**: 2を採用する。
- **Rationale**: MySQLの直接型変換は、既存の`0`/`1`が新ENUMの暗黙的な値（例: 内部インデックス）にキャストされる可能性があり、意図したマッピング（`0→pending`, `1→done`）を保証できない。明示的な`CASE`文でのバックフィルは、変換ロジックがマイグレーションSQLに可視化され、レビュー・検証がしやすい。
- **Trade-offs**: マイグレーションSQLのステップ数は増えるが、既存データを壊すリスクを大きく下げられる。
- **Follow-up**: 実装タスクで、移行前後のTodo件数と各ステータスの件数が一致することをテストで検証する。

### Decision: 既存の未完了/完了フィルタとの整合方針
- **Context**: 4値化後も「未完了/完了」の二分ロジック（5件制限含む）を壊さないことがConstraint（brief.md）として明記されている。
- **Alternatives Considered**:
  1. `done`以外を全て「未完了」として扱い、既存の2セクション構成（未完了/完了済み）を維持する
  2. `in_progress`/`blocked`を独立した第三のセクション（カンバン的な3カラム）として新設する
- **Selected Approach**: 1を採用し、既存の「未完了」セクション内でステータス（pending/in_progress/blocked）を表示・切替できる最小限のUIを追加する。
- **Rationale**: brief.mdのScopeで「大規模なUI刷新（カンバンビュー等）」が明示的にOutとされており、2は本specの境界を超える。1であれば既存のフィルタ・件数制限ロジック（`activeTodos.length`ベース）への影響を最小化できる。
- **Trade-offs**: 進行中/ブロック中を視覚的に強調する専用レイアウトにはならないが、要件5（最小限のステータス可視化・切替）は満たす。
- **Follow-up**: 将来カンバン化する場合は別specの責務とする。

### Decision: ステータス許容値の単一定義源
- **Context**: Fastifyスキーマ（API境界）とサービス層（防御的バリデーション）の双方でステータス値を検証する必要があり、値のリストが2箇所に分散すると将来の不整合リスクがある。
- **Alternatives Considered**:
  1. Fastifyスキーマとサービス層に個別に配列リテラルをハードコードする
  2. `todo-api/src/types/todo.ts`に許容値の単一の定数配列（`TODO_STATUSES`）を定義し、スキーマ・サービス両方から参照する
- **Selected Approach**: 2を採用する。
- **Rationale**: 許容値がenumとして後続spec（`task-rot-detection`, `redmine-integration`）からも参照される安定した契約であるため、単一の定義源から導出することで値のドリフトを防ぐ。
- **Trade-offs**: なし（既存のシンプルな型定義ファイルへの追加のみ）。
- **Follow-up**: フロントエンド側は独立したパッケージ共有機構がないため、`todo-web/lib/types.ts`側は手動でミラーする（既存の`UserRole`/`AccountStatus`と同じパターン）。

## Risks & Mitigations
- 既存テスト（`todos.repository.test.ts`, `todos.service.test.ts`, `TodoApp.test.tsx`, `ActiveTodos.test.tsx`, `DoneTodos.test.tsx`）が`status`を数値（0/1）でハードコードしている — 実装タスクでenum文字列値に置き換える。
- `orm-migration`が未実装のまま本specの実装に着手すると、Prisma Client生成前提のコードが型解決できない — ロードマップの依存順序（`orm-migration`実装完了後に着手）を実装計画上のゲートとして明記する。
- Fastifyスキーマとサービス層の許容値定義が将来ズレる — `TODO_STATUSES`定数を単一の参照元とすることで防ぐ（Design Decisions参照）。
- 移行対象データに想定外の値（0/1以外）が存在した場合、バックフィルの`CASE`式が意図しない値へフォールバックする可能性 — 移行SQLでは0/1以外を許容しない前提を明記し、実装時に既存データを事前調査する。

## References
- [.kiro/specs/orm-migration/design.md](../orm-migration/design.md) — Prismaスキーマ・リポジトリ層の既存契約
- [.kiro/specs/task-status-model/brief.md](brief.md) — Discovery段階の問題・スコープ整理
- `git show spec/task-rot-detection:.kiro/specs/task-rot-detection/design.md` — 未マージブランチ上の下流spec設計（enum依存関係の確認用）
