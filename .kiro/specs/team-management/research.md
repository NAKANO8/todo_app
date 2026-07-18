# Research & Design Decisions

## Summary
- **Feature**: `team-management`
- **Discovery Scope**: Extension（既存の認証・認可・データアクセス層への拡張。light discoveryを適用）
- **Key Findings**:
  - `orm-migration`がPrismaベースのリポジトリ層・スキーマ管理を確立済み（`prisma/schema.prisma`, `prismaClient.ts`, `TodoRepository`/`AuthRepository`のPrisma化）。本機能は同じ永続化パターンを踏襲し、新規の`GroupRepository`もPrisma Clientベースで実装する。
  - 既存の`role`ベース認可は「ガード（`adminOnlyGuard`/`requireAuthGuard`）がルート層でpreHandlerとして判定し、サービス層は権限チェックを行わない」という一貫した規約を持つ。`group_leader`向けの認可もこの規約（`groupLeaderOnlyGuard`という新規ガード）にそのまま従う。
  - 既存の`role`変更（`PATCH /admin/users/:userId/role`）はセッション強制無効化を伴わない。強制無効化が発生するのは`status`を`disabled`にする場合のみ（`AdminUserController.changeStatus`参照）。この既存の非対称性を踏襲し、グループ再割り当ておよび`group_leader`ロールの付与/剥奪もセッション無効化を発生させない設計とする。
  - 既存の`role`/`status`列はDBレベルの`DEFAULT`値（`'member'`/`'active'`）で新規ユーザーへの既定割り当てを実現しており、アプリケーションコードでの明示的な初期化は行っていない。同じパターンを`users.group_id`のDB既定値に適用できる。

## Research Log

### 既存の認可ガード・ルート・サービス・リポジトリパターン
- **Context**: `group_leader`の認可・グループCRUD・メンバーシップ変更を、既存のレイヤードアーキテクチャに矛盾なく組み込む必要がある。
- **Sources Consulted**: `todo-api/src/guards/adminOnly.ts`, `todo-api/src/guards/requireAuth.ts`, `todo-api/src/routes/admin.user.route.ts`, `todo-api/src/controllers/adminUser.controller.ts`, `todo-api/src/services/adminUser.service.ts`, `todo-api/src/repositories/auth.repository.ts`, `todo-api/src/types/admin.ts`, `todo-api/src/app.ts`
- **Findings**:
  - ガードはFastifyプラグインスコープの`preHandler`として登録され（`app.addHook("preHandler", adminOnlyGuard)`）、他ルートに影響しない（Fastifyのカプセル化）。
  - コントローラーは`try/catch`で`AppError`を捕捉し、`err.statusCode`をそのまま返す。権限チェックはコントローラー/サービス層では行わない。
  - リポジトリは1テーブル1リポジトリの原則（`TodoRepository`↔`todos`、`AuthRepository`↔`users`）。`affectedRows`（Prisma移行後は`count`）で404/409をサービス層が判別する契約。
  - 型定義は`types/admin.ts`にリクエストボディ・パラメータ型を集約し、リポジトリ側の型（`UserRole`等）を再利用する。
- **Implications**: `group_leader`向けガードは`adminOnlyGuard`と同型（`guards/groupLeaderOnly.ts`）で実装する。グループCRUDは新規`groups`テーブル1つに対応する`GroupRepository`を新設し、メンバーシップ（`users.group_id`）の変更は既存の`AuthRepository`（`users`テーブル担当）に`updateGroup`/`findByGroupId`として追加する（1テーブル1リポジトリの原則を維持）。

### role変更とセッション無効化の関係
- **Context**: brief.mdは「グループからの除外時にセッション強制ログアウトが必要かは設計フェーズで検討する」と明記しており、本フェーズで決定する必要がある。
- **Sources Consulted**: `todo-api/src/controllers/adminUser.controller.ts`（`changeStatus`内の`req.session.destroy()`呼び出しとそのコメント）、`todo-api/src/services/adminUser.service.ts`
- **Findings**: 既存実装は`status`を`disabled`にする場合のみ、自己ターゲットであればセッションを破棄する。`role`変更（`admin`↔`member`）は同様の無効化処理を一切伴わない。
- **Implications**: グループ再割り当ておよび`group_leader`ロールの付与/剥奪も、既存の`role`変更と同じ扱い（セッション無効化なし）とする。これにより、既存の「roleを変えてもセッションは切れない」というユーザーの期待と一貫する。

### デフォルトグループの実現方式
- **Context**: 要件2は「全ユーザーが常にちょうど1つのグループに所属する」ことを求める。新規登録ユーザー・既存ユーザーの双方にこの不変条件を機械的に保証する方式が必要。
- **Sources Consulted**: `.kiro/specs/admin-role/design.md`（`role`/`status`列のDB既定値パターン）、`todo-api/src/repositories/auth.repository.ts`の`createUser`
- **Findings**: `admin-role`は`role ENUM(...) NOT NULL DEFAULT 'member'`というDBレベルの既定値でアプリケーションコード変更なしに新規行への値割り当てを実現していた。同じ手法は`group_id`にも適用可能（DBの`DEFAULT`にデフォルトグループの固定ID値を設定する）。
- **Implications**: `users.group_id`にDBレベルの既定値（デフォルトグループの予約ID）を設定することで、`AuthRepository.createUser`のコード変更なしに要件2.2を満たす。デフォルトグループは`groups.is_default`フラグで識別し、削除保護（要件2.3の安全策）に用いる。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 中間テーブル（多対多membership） | `group_memberships`テーブルでuser-group関係を管理 | 将来の複数グループ所属に対応しやすい | 要件が明示的に1ユーザー1グループを求めており（Out of scope: 複数グループ所属）、過剰設計（YAGNI違反） | 不採用 |
| `users.group_id`（多対一） | 既存`users`テーブルに`group_id`外部キーを1列追加 | 既存の1テーブル1リポジトリ原則・既存の`role`/`status`と同じ「列追加」パターンに完全準拠。シンプルで要件を過不足なく満たす | 将来複数グループ所属が必要になった場合はスキーマ変更が必要（brief/roadmapで明示的にOut of scopeとされているため許容） | 採用 |

## Design Decisions

### Decision: `users.group_id`単一列によるメンバーシップ表現
- **Context**: 要件2・3は「1ユーザーは常にちょうど1つのグループに所属する」ことを求め、複数グループ所属・グループ階層は明示的にOut of scope。
- **Alternatives Considered**:
  1. 中間テーブル（多対多） — 将来の拡張性はあるが現要件には過剰
  2. `users.group_id`（多対一、外部キー1列） — 既存スキーマパターンに準拠しシンプル
- **Selected Approach**: `users`テーブルに`group_id INT NOT NULL`列と`groups`テーブルへの外部キー制約を追加する。
- **Rationale**: `orm-migration`が確立した「既存の列追加パターン」（`role`/`status`と同じ）に完全準拠し、要件が求める1対多の関係を過不足なく表現する。
- **Trade-offs**: 複数グループ所属が将来要件化した場合は中間テーブルへの移行が必要（この場合は別specとして再設計する）。
- **Follow-up**: なし（Out of scopeとして明示済み）。

### Decision: デフォルトグループのDBレベル既定値化
- **Context**: 新規ユーザー作成時・既存ユーザーへの移行時、双方で「常に1グループに所属」を保証する必要がある。
- **Alternatives Considered**:
  1. アプリケーションコード（`AuthRepository.createUser`）でデフォルトグループIDを都度クエリして設定
  2. DBレベルの`DEFAULT`値（デフォルトグループの予約IDを既定値として列定義）
- **Selected Approach**: `users.group_id`にDBレベルの`DEFAULT`（デフォルトグループの予約ID）を設定し、`createUser`のアプリケーションコードは変更しない。
- **Rationale**: 既存の`role`/`status`列と同じ規約（DB既定値による初期化）を維持し、アプリケーションコードの変更・往復クエリを避けられる。
- **Trade-offs**: デフォルトグループの予約ID（マイグレーションで最初に作成される行のID）が固定される前提に依存する。デフォルトグループ自体の削除を禁止する安全策（要件2.3）と対で運用する。
- **Follow-up**: マイグレーション実装時に、デフォルトグループ作成 → `users`への`group_id`列追加（既定値付き）の順序を保証する。

### Decision: グループ再割り当て/除外に伴うセッション無効化は行わない
- **Context**: brief.mdが設計フェーズでの決定を求めていた「グループ除外時のセッション強制ログアウトの要否」。
- **Alternatives Considered**:
  1. グループ再割り当て時にセッションを強制無効化する（`status`無効化と同様の扱い）
  2. 既存の`role`変更と同様、セッション無効化を行わない
- **Selected Approach**: 2を採用。グループ再割り当ておよび`group_leader`ロールの付与/剥奪はセッションに影響しない。
- **Rationale**: 既存実装は`status`無効化のみをセッション無効化のトリガーとしており、`role`変更（`admin`↔`member`）はトリガーにしていない。グループ再割り当ても同種の権限変更であり、既存の非対称性と矛盾しない扱いが一貫性を保つ。
- **Trade-offs**: グループ変更直後も旧グループの`group_leader`権限が新しいリクエストが来るまで（＝ほぼ即時、セッション自体には権限情報をキャッシュしていないため）反映され続けることはない。`groupLeaderOnlyGuard`は毎リクエスト`AuthRepository.findById`で最新の`role`/`group_id`を参照するため、実質的な権限漏れは発生しない。
- **Follow-up**: なし。

### Decision: `group_leader`の「自グループ」は現在の所属（`group_id`）と同一視する
- **Context**: 要件4.4は「`group_leader`が現在所属しているグループを自グループとして扱う」ことを求める。リーダー専用の別テーブル・列（例: `groups.leader_id`）を設けるかが論点。
- **Alternatives Considered**:
  1. `groups`テーブルに`leader_id`列を追加し、1グループにつき1人のリーダーを明示的に紐付ける
  2. 既存の`users.group_id`と`role='group_leader'`の組み合わせのみで「自グループ」を導出する（追加スキーマなし）
- **Selected Approach**: 2を採用。`group_leader`ロールを持つユーザーの`group_id`が、そのままそのユーザーの「自グループ」となる。1グループに複数の`group_leader`が存在することを許容する（要件はリーダー数の上限を定めていない）。
- **Rationale**: Simplification原則に従い、要件が求めていない「1グループ1リーダー」制約や専用スキーマを追加しない。既存の`group_id`列のみで要件4.4・4.5・5.1を満たせる。
- **Trade-offs**: 将来「1グループ1リーダー」制約が必要になった場合は`groups.leader_id`への移行が必要（現要件では不要）。
- **Follow-up**: なし。

## Risks & Mitigations
- デフォルトグループが空になった状態で削除されると、以降の新規登録・除外操作が既定値解決に失敗する — デフォルトグループの削除は常に拒否する（メンバー数に関わらず）という安全策をリポジトリ/サービス層に実装し、緩和する。
- `group_id`列の追加マイグレーション（NOT NULL化）は、デフォルトグループ作成 → 列追加（NULL許容）→ 全既存行のbackfill → NOT NULL化 → 外部キー制約追加、という順序を誤ると失敗する — Migration Strategyセクションでフェーズを明示し、各フェーズの検証チェックポイントを設ける。
- `groupLeaderOnlyGuard`実装時に`adminOnlyGuard`をコピー&ペーストして`role`比較対象を変え忘れる（`admin`のまま）と認可バイパスにつながる — レビュー時にガードの比較値を明示的に確認する。

## References
- `.kiro/specs/orm-migration/design.md` — Prismaスキーマ規約、リポジトリ層のPrisma移行パターン
- `.kiro/specs/admin-role/design.md` — `role`列のDB既定値パターン、enum拡張時の注意点
- `.kiro/specs/admin-user-management/requirements.md` — グループ/チーム単位のアクセス制御が本specに委譲されていることの確認
- `todo-api/src/guards/adminOnly.ts`, `todo-api/src/guards/requireAuth.ts` — 既存ガードの実装規約
