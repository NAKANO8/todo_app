# Research & Design Decisions

---
**Purpose**: 発見事項・アーキテクチャ調査・技術設計を裏付ける根拠を記録する。
---

## Summary
- **Feature**: `orm-migration`
- **Discovery Scope**: Extension（既存のデータアクセス層の置き換え。新規外部API連携なし）
- **Key Findings**:
  - 対象テーブルは`users`と`todos`の2つのみ（`mysql/init.sql`が唯一のスキーマ定義源）。マイグレーション管理の仕組みは現状存在しない
  - `SessionRepository`はRedisベースであり`mysql2`に依存しないため、brief記載の「admin.session」はPrisma移行の対象に含まれない（コードベース確認により判明した事実。Boundary Contextに反映済み）
  - `AuthRepository`は「認証」「管理者操作（role/status変更）」「プロフィール操作（name/password変更）」の3ドメインを1ファイルに集約しているが、呼び出し元（`AuthService`, `AdminUserService`, `ProfileService`）は分離されている
  - `updateRole`/`updateStatus`は「有効な管理者が最低1人残る」不変条件をアプリケーション層の2段階チェックではなく、単一のUPDATE文（派生テーブルでラップしたEXISTSサブクエリ）でアトミックに強制している。これはMySQLのERROR 1093（UPDATE対象テーブルをFROM句のサブクエリで直接参照できない制約）を回避するための意図的な実装であり、Prisma移行後もこのレースコンディション耐性を維持する必要がある
  - 既存のリポジトリ層テストは`_test_`配下でモック無しの実MySQL統合テストとして書かれている（`pool`を直接操作してfixtureを準備・後始末）
  - CI（`ci.yml`）は`mysql -h ... < mysql/init.sql`でスキーマを適用してからテストを実行する。docker-composeの`db`サービスは`./mysql:/docker-entrypoint-initdb.d`をマウントして初回起動時にスキーマを作成する
  - Prisma CLI / `@prisma/client`の現行安定バージョンはnpm registry確認時点で`7.8.0`（Node.js 22を使用しているCI/Dockerfile環境と互換）

## Research Log

### 既存スキーマの構造（mysql/init.sql）
- **Context**: Prismaスキーマ定義（Requirement 1）のために正確なカラム定義・制約が必要
- **Sources Consulted**: `mysql/init.sql`
- **Findings**:
  - `users`: id(PK, AUTO_INCREMENT), email(UNIQUE, NOT NULL), password_hash(NOT NULL), role(ENUM admin/member, DEFAULT member), status(ENUM active/disabled, DEFAULT active), created_at/updated_at(DATETIME, DEFAULT CURRENT_TIMESTAMP / ON UPDATE), name(NOT NULL)
  - `todos`: id(PK, AUTO_INCREMENT), user_id(NOT NULL, FK→users.id ON DELETE CASCADE), title(NOT NULL), status(BOOLEAN, DEFAULT 0), created_at/updated_at(同上)
- **Implications**: Prismaスキーマはこれらの制約・デフォルト値・enum値をそのまま反映する（Requirement 1.1〜1.3）。`todos.status`はBOOLEAN（実体はTINYINT(1)）であり、既存の`Todo`型（`status: number`のような数値表現／`TodoRepository.create`の`status: number = 0`引数）との整合を保つ必要がある

### AuthRepositoryのドメイン集約と呼び出し元
- **Context**: brief記載の「auth, admin.user, profile, admin.session」という区分と実際のファイル構成の対応関係を確認するため
- **Sources Consulted**: `todo-api/src/repositories/auth.repository.ts`, `todo-api/src/services/{auth,adminUser,profile,session}.service.ts`
- **Findings**:
  - `auth`（login/register/me）・`admin.user`（updateRole/updateStatus/findAll）・`profile`（updateName/findPasswordHashById/updatePasswordHash）の3ドメインは全て`AuthRepository`という単一オブジェクトに実装されている
  - `admin.session`に相当するMySQLベースのリポジトリは存在しない。セッション追跡は`SessionRepository`（Redis Setによるuser→sessionId逆引き索引）が担っており、`mysql2`/リレーショナルDBとは無関係
- **Implications**: Requirement 3は`AuthRepository`単一ファイルの全メソッドを対象とする。`SessionRepository`はOut of Boundaryとして明示する

### 「最後の管理者」不変条件のSQL実装
- **Context**: `updateRole`/`updateStatus`のコメントに記載されたMySQLの制約（ERROR 1093）と回避策を、Prisma移行後も壊さない設計にするため
- **Sources Consulted**: `todo-api/src/repositories/auth.repository.ts`のコメント、`todo-api/src/repositories/_test_/auth.repository.concurrency.test.ts`
- **Findings**:
  - 対象行(id)基準の単一UPDATE文＋派生テーブルでラップしたEXISTSサブクエリにより、「count確認→update」の2ステップに分解せずアトミックに不変条件を強制している
  - `updated_at = NOW()`を明示的にSETに含めることで、値が変化しない冪等な再送でも`affectedRows >= 1`を返す仕様になっている（呼び出し元の`AdminUserService`はこの`affectedRows`のみで404/409を判別する）
  - Prismaの標準的なフルーエントAPI（`update`/`updateMany`）は、同一テーブルを参照する条件付きサブクエリを伴うアトミックな単一UPDATE文を表現できない
- **Implications**: この2メソッドに限り、Prisma Clientの`$executeRaw`（タグ付きテンプレート、パラメータバインドあり）で既存と同一のSQL文をそのまま実行する。これはBuild vs Adoptの判断（下記）として記録し、design.mdにも明記する

### マイグレーション運用とデプロイ経路
- **Context**: Requirement 4（マイグレーション運用の確立）のため、現在のスキーマ適用経路を把握する
- **Sources Consulted**: `.github/workflows/ci.yml`, `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.prod.yml`, `todo-api/Dockerfile`
- **Findings**:
  - CI: MySQLサービスコンテナに対し`mysql ... < mysql/init.sql`でスキーマ適用後にテスト実行
  - dev/prod: `db`サービスが`./mysql:/docker-entrypoint-initdb.d`をマウントし、コンテナ初回起動時にMySQL公式イメージのエントリポイントが自動実行
  - `todo-api/Dockerfile`のCMDは`pnpm run start`のみで、マイグレーション適用ステップは存在しない
  - 接続情報は`DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_PORT`の個別環境変数（mysql2形式）。Prismaは単一の接続文字列`DATABASE_URL`を要求する
- **Implications**: `DATABASE_URL`を新規環境変数として`.env.dev`・本番`.env`・CIのenvに追加する。`mysql/init.sql`によるスキーマ作成をPrisma Migrateのベースラインマイグレーションに置き換え、CI・Dockerfile・docker-compose（dev/prod）の起動シーケンスに`prisma migrate deploy`を組み込む。既存の永続化済みdb-dataボリューム（dev/prod）は既にスキーマ適用済みのため、初回切替時のみ`prisma migrate resolve --applied`によるベースライン化が必要（データ再作成なし）

### Prismaバージョン確認
- **Context**: briefで既に採用が決定しているPrismaについて、現行バージョンとNode.js互換性のみ確認（外部アーキテクチャ調査は不要という前提）
- **Sources Consulted**: npm registry（`npm view prisma version` / `npm view @prisma/client version`）
- **Findings**: 現行安定版は`7.8.0`。CI/Dockerfileは共にNode.js 22を使用しており、Prismaの要求バージョンと互換
- **Implications**: `package.json`に`prisma`（devDependencies）・`@prisma/client`（dependencies）を`^7.8.0`で追加する

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Prisma Client（標準フルーエントAPI）を全メソッドに適用 | 全クエリをPrismaのモデルAPIで書き直す | 型安全性・可読性が最も高い | `updateRole`/`updateStatus`のアトミックな条件付き更新を表現できない | 採用（一部を除く） |
| Prisma `$executeRaw`によるハイブリッド | 標準CRUDはPrisma API、不変条件クリティカルな2メソッドのみ生SQL | 既存のレースコンディション耐性を完全に保持しつつ大部分は型安全化 | 生SQL部分は手動でスキーマ変更に追従させる必要がある | 採用 |
| アプリケーション層でcount→updateの2ステップに分解 | Prisma標準APIのみで完結させる | 実装がシンプル | 既存のアトミック性（TOCTOU耐性）が失われ、Requirement 5（非回帰）に違反しうる | 不採用 |

## Design Decisions

### Decision: `updateRole`/`updateStatus`はPrismaの`$executeRaw`で既存SQLを維持する
- **Context**: 「有効な管理者が最低1人残る」不変条件をアトミックに強制する既存実装（派生テーブルでラップしたEXISTSサブクエリ）は、Prismaの標準フルーエントAPIでは表現できない
- **Alternatives Considered**:
  1. Prisma標準APIでcount確認→updateの2ステップに分解する
  2. `$executeRaw`で既存と同一のパラメータ化SQLをそのまま実行する
- **Selected Approach**: 2. 既存のSQL文言（派生テーブルによるEXISTSラップ含む）をそのまま`$executeRaw`で実行し、返り値の影響行数を既存の`affectedRows`同様に呼び出し元（`AdminUserService`）へ返す
- **Rationale**: Requirement 5（非回帰）を満たすには、レースコンディション耐性を含めて挙動を1ビットも変えないことが最優先。Prisma導入の目的は「今後の新規スキーマ変更を型安全にする」ことであり、既存の1文の複雑なSQLを無理にORM化する必要はない
- **Trade-offs**: この2メソッドの型安全性向上は限定的（入力パラメータの型は保てるが、SQL文自体はPrismaの型システムでは検証されない）。将来この不変条件ロジックを変更する場合は生SQLを手動で更新する必要がある
- **Follow-up**: 実装時、Prisma 7.8.0での`$executeRaw`のプレースホルダ構文・戻り値型（影響行数の取得方法）をインストール済みCLIのドキュメントで確認する

### Decision: リポジトリの戻り値型はPrismaが生成する型ではなく既存のドメイン型を維持する
- **Context**: Prismaはスキーマから`User`/`Todo`等のモデル型を自動生成するが、既存コードは`todo-api/src/types/`と`auth.repository.ts`内で独自の`Todo`/`User`/`UserSummary`型を定義し、サービス・コントローラー層まで伝播させている
- **Alternatives Considered**:
  1. Prisma生成型をサービス・コントローラー層まで直接伝播させる
  2. リポジトリ層でPrisma生成型を既存のドメイン型にマッピングし、リポジトリの公開シグネチャは変更しない
- **Selected Approach**: 2. リポジトリ層を型変換の境界とする
- **Rationale**: Requirement 5.1（APIレスポンス形式の非回帰）を満たすには、サービス・コントローラー層のコードや型を変更しない方が安全。Prisma生成型がフィールド追加等で変化しても、リポジトリ境界で吸収できる
- **Trade-offs**: リポジトリ層に薄いマッピングコードが必要になるが、大半のフィールドは同名のため実質的にはPrismaの戻り値をそのまま既存型として扱える（構造的部分型のため追加コード不要なケースが多い）
- **Follow-up**: 実装時、Prismaが返す日時フィールドの型（`Date`オブジェクト）と既存の`Todo.created_at: string`型注釈との整合を確認する（既存実装もmysql2からDateオブジェクトを受け取っている可能性があり、JSON化時点でISO文字列化されるため実挙動への影響はないと想定される。実装タスクで確認する）

### Decision: `mysql/init.sql`によるスキーマブートストラップをPrisma Migrateのベースラインマイグレーションに置き換える
- **Context**: 現状、スキーマ作成の正とCI/docker-composeでの適用経路が`mysql/init.sql`一本化されており、マイグレーション履歴の仕組みがない
- **Alternatives Considered**:
  1. `mysql/init.sql`と`prisma/migrations/`を並存させる
  2. `prisma/migrations/`のベースラインマイグレーションを唯一のスキーマ源とし、`mysql/init.sql`は廃止する
- **Selected Approach**: 2. ベースラインマイグレーション（`prisma/migrations/0_init/migration.sql`、`mysql/init.sql`と同一のDDL）を作成し、以後のスキーマ変更は`prisma migrate dev`で生成する。CI・Dockerfile・docker-composeの起動シーケンスを`prisma migrate deploy`経由に変更する
- **Rationale**: スキーマ源を二重管理すると乖離のリスクがある。Prismaのマイグレーション履歴を唯一の正とすることが、Requirement 4の意図（以降のspecが型安全にスキーマ変更できる基盤）に合致する
- **Trade-offs**: 既存の永続化済みDBボリューム（dev/prod）は初回切替時に`prisma migrate resolve --applied`によるベースライン化という1回限りの手動運用ステップが必要
- **Follow-up**: 実装タスクでベースライン化手順をドキュメント化する（tasks.md参照）

## Risks & Mitigations
- Prisma 7.8.0のMySQL接続方式（ドライバアダプタの要否・パッケージ名）がPrismaのメジャーバージョン間で変更されている可能性がある — 実装タスクの最初でインストールしたCLIの`prisma init`出力・公式ドキュメントを確認し、`db/prismaClient.ts`の実装方針を確定させてから他タスクに着手する
- 永続化済みdev/prodのDBボリュームに対するベースライン化を怠ると、`prisma migrate deploy`が既存テーブルの重複作成を試みて失敗する — 運用手順書（tasks.mdのマイグレーション運用タスク）に明記し、デプロイ前チェックリストに含める
- `$executeRaw`はPrismaのマイグレーション検証・型チェックの対象外であるため、`users`テーブルのカラム名を将来変更する際にこの2メソッドの生SQLを見落とすリスクがある — コード内コメントで「スキーマ変更時はこのSQLも要確認」と明記する

## References
- npm registry（`prisma`, `@prisma/client`）— バージョン確認のみ、2026-07-18時点で`7.8.0`
