# Implementation Plan

- [ ] 1. Foundation: Prisma基盤整備
- [ ] 1.1 Prisma導入と接続設定の確立
  - `todo-api/package.json`に`prisma`(devDependencies)と`@prisma/client`(dependencies)を`^7.8.0`で追加する
  - `prisma init`のスキャフォールド出力を確認し、Prisma 7.8.0でのMySQL接続方式（ドライバアダプタの要否・パッケージ名）を確定する
  - `DATABASE_URL`環境変数を`.env.dev`・本番環境変数・CI環境変数に追加する（既存の`DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_PORT`から組み立てた接続文字列）
  - 観測可能な完了状態: `npx prisma validate`がエラーなく完了する
  - _Requirements: 1.1_

- [ ] 1.2 schema.prismaへのモデル・enum定義
  - `prisma/schema.prisma`に`datasource`（provider: mysql, url: env("DATABASE_URL")）と`generator client`を定義する
  - `User`モデルを定義する（id, email, password_hash, role, status, created_at, updated_at, name。既存の型・NULL制約・デフォルト値・UNIQUE制約を保持し、`@@map("users")`で物理テーブル名を維持する）
  - `Todo`モデルを定義する（id, user_id, title, status, created_at, updated_at、`User`への`@relation(onDelete: Cascade)`、`@@map("todos")`）
  - `UserRole`（admin/member）・`AccountStatus`（active/disabled）のenumを定義する
  - 観測可能な完了状態: `npx prisma generate`が成功し、`User`/`Todo`/`UserRole`/`AccountStatus`の型が生成される
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 1.3 ベースラインマイグレーションの作成
  - `prisma/migrations/0_init/migration.sql`を作成し、DDLが`mysql/init.sql`と同一の構造（カラム・制約・デフォルト値・外部キー）になっていることを確認する
  - 新規の空DBに対して`prisma migrate deploy`を実行し、`mysql/init.sql`適用後と同一のテーブル構造が得られることを確認する
  - 観測可能な完了状態: 空のMySQLコンテナに対し`prisma migrate deploy`を実行した結果、`SHOW CREATE TABLE users`/`SHOW CREATE TABLE todos`の出力が既存スキーマと一致する
  - _Requirements: 1.4, 4.1_

- [ ] 1.4 PrismaClientシングルトンの実装
  - `todo-api/src/db/prismaClient.ts`を新規作成し、モジュール読み込み時に`PrismaClient`を1度だけインスタンス化してexportする（`db/client.ts`の`pool`と同じ初期化パターン）
  - `dotenv`による`.env`読み込みを既存の`db/client.ts`と同じ規約で行う
  - 観測可能な完了状態: `prismaClient.ts`をimportした最小スクリプトが`prisma.$connect()`に成功する
  - _Requirements: 2.1, 3.1_

- [ ] 2. (P) Todoデータアクセス移行
  - `todos.repository.ts`のみを対象とするドメインであり、3.（`auth.repository.ts`）とはファイル・境界が重複しないため並行実施可能。ただし2.1〜2.3は同一ファイルを編集するため内部は順次実施する
- [ ] 2.1 Todo参照系メソッドのPrisma化
  - `TodoRepository.findAll(userId)`を`prisma.todo.findMany({ where: { userId } })`相当に置き換える
  - `TodoRepository.findById(id, userId)`を`prisma.todo.findFirst({ where: { id, userId } })`相当に置き換え、非該当時は`null`を返す
  - 公開メソッドシグネチャ・戻り値の型（`Todo[]`/`Todo | null`）を変更しない
  - 観測可能な完了状態: 既存の`TodoService.getAll`/`getById`がコード変更なしに動作する
  - _Requirements: 2.1, 2.2, 2.7_
  - _Boundary: TodoRepository_
  - _Depends: 1.4_

- [ ] 2.2 Todo更新系メソッドのPrisma化
  - `TodoRepository.create(title, userId, status)`を`prisma.todo.create(...)`相当に置き換える
  - `TodoRepository.update(id, userId, data)`を、指定された`title`/`status`のみを更新する`prisma.todo.updateMany({ where: { id, userId }, data: {...} })`相当に置き換え、指定フィールドが0件の場合はDB呼び出しを行わない早期returnを維持する
  - `TodoRepository.delete(id, userId)`を`prisma.todo.deleteMany({ where: { id, userId } })`相当に置き換える
  - 全メソッドで`userId`条件を必ず含め、他ユーザーのTodoを操作させない
  - 観測可能な完了状態: 指定フィールドなしの`update`呼び出し後にDBへの書き込みクエリが発行されないことをテストで確認できる
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7_
  - _Boundary: TodoRepository_

- [ ] 2.3 Todoリポジトリテストの検証
  - `todo-api/src/repositories/_test_/todos.repository.test.ts`のfixture準備・後始末（`pool.query`呼び出し）をPrisma Client呼び出しに最小限差し替える
  - create→findAll、findById、update、deleteの既存アサーションが移行前と同じ結果になることを確認する
  - 観測可能な完了状態: `pnpm --filter todo-api test todos.repository`が全て合格する
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.4_
  - _Boundary: TodoRepository_
  - _Depends: 2.1, 2.2_

- [ ] 3. (P) 認証・ユーザー管理データアクセス移行
  - `auth.repository.ts`のみを対象とするドメインであり、2.（`todos.repository.ts`）とはファイル・境界が重複しないため並行実施可能。ただし3.1〜3.3は同一ファイルを編集するため内部は順次実施する
- [ ] 3.1 Auth標準CRUDメソッドのPrisma化
  - `findByEmail`（password_hashを含む全カラム取得）、`findById`（password_hash除外）、`findAll`（password_hash除外の一覧）を`prisma.user.findUnique`/`findMany`相当に置き換える
  - `createUser`を`prisma.user.create(...)`相当に置き換える
  - `updateName`（表示名更新）、`findPasswordHashById`（password_hashのみ取得）、`updatePasswordHash`（password_hash更新）を`prisma.user.update`/`findUnique`相当に置き換える
  - 既存の`User`/`UserSummary`/`UserRole`/`AccountStatus`型定義とexportを維持する
  - 観測可能な完了状態: `AuthService.login`/`register`/`me`、`ProfileService.updateName`/`changePassword`がコード変更なしに動作する
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.10, 3.11, 3.12_
  - _Boundary: AuthRepository_
  - _Depends: 1.4_

- [ ] 3.2 updateRole/updateStatusの不変条件維持移行
  - `updateRole`/`updateStatus`を、既存と同一のSQL文（対象行(id)基準の単一UPDATE、派生テーブルでラップしたEXISTSサブクエリによる「対象ユーザー以外に有効な管理者が1人以上いる」判定）のまま`prisma.$executeRaw`（タグ付きテンプレート、パラメータバインド）で実行するよう置き換える
  - `updated_at = NOW()`を明示的にSETに含める既存の冪等性保証（値が変化しない再送でも影響行数1以上を返す）を維持する
  - 戻り値として影響行数（既存の`affectedRows`相当の数値）を返す
  - 観測可能な完了状態: 唯一の有効な管理者に対する降格・無効化要求で影響行数0が返り、`AdminUserService`側で409エラーとして判別できる
  - _Requirements: 3.5, 3.6, 3.7, 3.8, 3.9_
  - _Boundary: AuthRepository_

- [ ] 3.3 Authリポジトリテストの検証
  - `auth.repository.test.ts`・`auth.repository.concurrency.test.ts`のfixture準備・後始末をPrisma Client呼び出しに最小限差し替える
  - 「唯一の有効な管理者」への降格・無効化拒否、冪等な再送、並行更新時の不変条件に関する既存アサーションが移行前と同じ結果になることを確認する
  - 観測可能な完了状態: `pnpm --filter todo-api test auth.repository`が全て合格する
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 5.1, 5.2, 5.4_
  - _Boundary: AuthRepository_
  - _Depends: 3.1, 3.2_

- [ ] 4. Integration: マイグレーション運用のCI/Docker組み込み
- [ ] 4.1 CIワークフローのスキーマ適用手順置き換え
  - `.github/workflows/ci.yml`の`mysql -h ... < mysql/init.sql`ステップを`pnpm --filter todo-api exec prisma migrate deploy`に置き換える
  - CI環境変数に`DATABASE_URL`を追加する
  - 観測可能な完了状態: CI上で`prisma migrate deploy`実行後、既存のVitestスイート（`pnpm test`）が全て合格する
  - _Requirements: 4.1, 4.2, 4.3, 5.4_
  - _Depends: 1.3_

- [ ] 4.2 Docker起動シーケンスへのマイグレーション適用組み込み
  - `todo-api/Dockerfile`の`CMD`を、`prisma migrate deploy`実行後にアプリを起動する順序に変更する（失敗時はアプリを起動しない）
  - `docker-compose.dev.yml`の`api.command`を、`prisma migrate deploy`実行後に`pnpm run dev`を起動する順序に変更する
  - 観測可能な完了状態: `pnpm docker:dev`起動時にコンテナログでマイグレーション適用（またはno-op）の後にアプリが起動することを確認できる
  - _Requirements: 4.3, 4.4_
  - _Depends: 1.3_

- [ ] 4.3 既存永続化ボリュームのベースライン化
  - 既存のdev/prod DBボリューム（`db-data-dev`/`db-data`）に対し、`prisma migrate resolve --applied 0_init`を1回実行してベースラインマイグレーションを「適用済み」として記録する手順を確立し、実行する
  - この手順をマイグレーション運用ドキュメント（`prisma/migrations/`近傍またはREADME等）に記録する
  - 観測可能な完了状態: ベースライン化実行後の既存dev DBボリュームに対し`prisma migrate deploy`が「pending migrations: none」で正常終了する
  - _Requirements: 4.4_
  - _Depends: 4.2_

- [ ] 5. Validation: 非回帰確認とクリーンアップ
- [ ] 5.1 全体非回帰検証
  - `pnpm --filter todo-api test`（Vitest全体）と`pnpm --filter todo-api build`（型チェック）が合格することを確認する
  - `SessionRepository`/`sessionRepositoryInstance.ts`にコード差分がないことを確認する
  - APIレスポンス形式・`AppError`のエラーハンドリング挙動・認可ロジックに変更がないことを、既存のservices/controllers配下のテストが無修正で合格することにより確認する
  - 観測可能な完了状態: `pnpm --filter todo-api test`と`pnpm --filter todo-api build`が両方とも成功終了する
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 5.2 mysql2依存の後片付け
  - 全リポジトリのPrisma移行完了を確認した上で、`todo-api/src/db/client.ts`（`mysql2` pool）を削除する
  - `todo-api/package.json`から`mysql2`依存を削除する
  - `mysql/init.sql`の取り扱い（削除するか、参考用に残置するか）を決定し反映する
  - 観測可能な完了状態: `todo-api/src/db/client.ts`を参照するimportがコードベースに存在せず、`pnpm --filter todo-api build`が成功する
  - _Requirements: 1.4, 4.1_
  - _Depends: 5.1_
