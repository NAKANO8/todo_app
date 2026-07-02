# Research & Design Decisions

## Summary
- **Feature**: `admin-role`
- **Discovery Scope**: Extension（既存の認証機能への追加）
- **Key Findings**:
  - `/auth/register`・`/auth/login`の`authBodySchema`は`additionalProperties: false`を既に設定している。ロールの自己申告による特権昇格対策（Req 2.2）は、新規コード追加なしで既存の検証がカバーする。**【タスク4.1実装時に訂正】** 当初「未定義フィールドを含むリクエストは400で拒否される」と想定していたが誤り。Fastify 5のデフォルトAJV設定は`removeAdditional: true`のため、実際には未定義フィールドが黙って削除された上でリクエストは201で成功する。`role`がDBに届かない、という肝心のセキュリティ特性は変わらず満たされる。
  - `mysql/init.sql`はDockerの`docker-entrypoint-initdb.d`経由で「空のデータディレクトリに対してのみ」実行される。稼働中の本番DB（`to-do.hikawata.com`）には自動反映されないため、既存データへの列追加は別途手動のALTER TABLEが必要。
  - MySQLは8.0（`docker-compose.yml`/`docker-compose.prod.yml`で確認）。既定値付きの列追加（`ADD COLUMN ... DEFAULT ...`）はMySQL 8.0のInstant DDL（`ALGORITHM=INSTANT`）で行内データの書き換えを伴わずに完了するため、既存ログイン・セッションへの影響はない。
  - フロントエンド（`todo-web/middleware.ts`）は`/auth/me`のレスポンスボディを一切読まず、HTTPステータスのみで認証判定している。よって本機能はフロントエンドに変更を要しない。

## Research Log

### `role`カラムの型選択
- **Context**: Requirement 1.1〜1.3（全アカウントがロールを持つ、値を`admin`/`member`に制限、将来の値追加に既存データが耐えられる）
- **Sources Consulted**: `mysql/init.sql`（既存テーブル定義）、`.kiro/steering/tech.md`（ORM不使用、生SQLの方針）
- **Findings**: プロジェクトはORMを使わず素のSQL型（`INT`, `VARCHAR`, `BOOLEAN`など）のみを使用している。MySQLの`ENUM`型はDBレベルで値集合を強制でき、`ALTER TABLE ... MODIFY COLUMN`による値追加は既存行データを書き換えない。
- **Implications**: `role ENUM('admin','member') NOT NULL DEFAULT 'member'`を採用。

### 既存アカウントへのロール付与（Req 3.1, 3.2）
- **Context**: 本番DBには稼働中データが存在し、ダウンタイムなく移行する必要がある
- **Sources Consulted**: `docker-compose.yml`（`mysql:8.0`）, MySQL 8.0 Instant DDLの仕様
- **Findings**: `ADD COLUMN role ... DEFAULT 'member'`は末尾列かつ固定長デフォルトのため、MySQL 8.0でInstant DDL対象となり、既存行はメタデータ更新のみで新カラムの値を得る。テーブルロック・書き換えを伴わない。
- **Implications**: 明示的なバックフィルSQL（`UPDATE users SET role='member' WHERE role IS NULL`等）は不要。`ADD COLUMN ... DEFAULT 'member'`一文で3.1/3.2を満たす。

### 特権昇格防止の実現方法（Req 2.2）
- **Context**: 登録リクエストに`role`値が含まれていても、それを無視して`member`を割り当てる必要がある
- **Sources Consulted**: `todo-api/src/routes/auth.route.ts`（`authBodySchema`）
- **Findings**: `authBodySchema`は`additionalProperties: false`かつ`email`/`password`のみを許可プロパティとして定義済み。当初「`role`を含むリクエストボディはFastify/AJVのスキーマ検証で400エラーとなり、ハンドラに到達しない」と想定していたが、タスク4.1の実装時にこれは誤りと判明した。Fastify 5のデフォルトAJV設定（`removeAdditional: true`）により、実際には`role`のような未定義フィールドは黙って取り除かれ、リクエストは201で成功する。
- **Implications**: 新規の除去ロジックは不要（この点は変わらず）。ただし既存スキーマが実現しているのは「拒否」ではなく「無視」であり、これはRequirement 2.2の文言「その値を無視し、常に`member`を割り当てる」とむしろ正確に一致する。design.mdの該当箇所も訂正済み。

## Architecture Pattern Evaluation
| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| MySQL `ENUM` 型 | DB列でロール値集合を直接制約 | DBレベルでの値保証、素のSQL方針と一貫、既存行を壊さず値追加可能 | 値追加時に`ALTER TABLE`が必要（データ書き換えは不要） | 採用 |
| `VARCHAR` + アプリ層バリデーション | 文字列列にアプリコードで許可値チェック | スキーマ変更なしで値追加可能 | DB制約がなくなり、チェック漏れのリスクがすべての書き込み経路に分散する | 不採用 |
| `BOOLEAN`（`is_admin`等） | 管理者フラグのみのシンプルな2値 | 実装が最も単純 | `group_leader`等の将来値を表現できず、非対象セクションの制約に反する | 不採用（要件で明示的に除外） |

## Design Decisions

### Decision: `role`カラムの型を`ENUM('admin','member')`にする
- **Context**: Requirement 1.1〜1.3
- **Alternatives Considered**:
  1. `VARCHAR` + アプリ層バリデーション
  2. `BOOLEAN`フラグ
- **Selected Approach**: `ENUM('admin','member') NOT NULL DEFAULT 'member'`
- **Rationale**: DBレベルで値集合を保証しつつ、既存の生SQL方針と一貫する。値追加時も既存データの書き換えが発生しない。
- **Trade-offs**: 新しいロール値の追加には`ALTER TABLE`が必要（ダウンタイムなしのメタデータ操作のみ）。
- **Follow-up**: グループ機能実装時、`group_leader`追加のための`ALTER TABLE ... MODIFY COLUMN`を別スペックで実施すること。

### Decision: 特権昇格防止は既存のリクエストスキーマ検証に委ねる
- **Context**: Requirement 2.2
- **Alternatives Considered**:
  1. コントローラ/サービス層で`role`フィールドを明示的に無視するコードを追加
  2. 既存の`additionalProperties: false`による検証をそのまま利用
- **Selected Approach**: 既存スキーマ検証をそのまま利用し、新規コードを追加しない
- **Rationale**: 既存の検証が既にこの脅威を閉じている。新しい無視ロジックを追加すると、同じ懸念に対して2つの防御層ができ、意図がぼやける。
- **Trade-offs**: 【訂正】当初は「Requirement 2.2の文言は『無視して`member`を割り当てる』だが、実際の挙動は『リクエスト全体を400で拒否する』ため文言と厳密には異なる」という差異をTrade-offとして記録していたが、これはFastifyの実際の挙動（`removeAdditional: true`により黙って無視・201で成功）を誤解していたことによる誤記だった。実際には文言とのズレは存在せず、実装通りの挙動である。この件が判明した経緯・影響範囲調査（`removeAdditional`をアプリ全体で`false`にするかの検討）は`todos-app-internal`のロードマップに別途記録した。
- **Follow-up**: なし。

### Decision: 既存アカウントへのロール付与は`DEFAULT`句のみで実現し、専用マイグレーションツールは導入しない
- **Context**: Requirement 3.1, 3.2。プロジェクトには現状マイグレーションツールが存在しない（`mysql/init.sql`のみ）
- **Alternatives Considered**:
  1. マイグレーションツール（例: `db-migrate`, `Flyway`）の導入
  2. `ADD COLUMN ... DEFAULT 'member'`の単一SQL文＋手動適用
- **Selected Approach**: 2
- **Rationale**: マイグレーションツールの導入はロードマップ上も本スペックの対象外であり、スコープ外の基盤整備をここで抱え込むべきではない（Simplification原則）。
- **Trade-offs**: 本番DBへの適用は手動運用に依存する。将来的にマイグレーションツールを導入する場合は別スペックで対応する。
- **Follow-up**: なし（本番適用手順はdesign.mdのMigration Strategyに記載）。

## Risks & Mitigations
- 本番DBへの`ALTER TABLE`適用を忘れると、コードは`role`カラムを前提にしているのに本番だけ列が存在せず、`/auth/me`等がエラーになる — デプロイ手順に手動適用ステップを明記し、デプロイ前チェックリストに追加する
- 将来`group_leader`等の値を追加する際、`ENUM`の`ALTER TABLE ... MODIFY COLUMN`を忘れると型定義（TypeScript側）とDB側の値集合がずれる — グループ機能スペックのタスクに両方の変更を含めるようrevalidation triggerとして明記

## References
- なし（外部ライブラリ・APIの新規調査は不要な小規模拡張のため）
