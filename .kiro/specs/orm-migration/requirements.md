# Requirements Document

## Project Description (Input)
開発チームは、`team-management`/`task-status-model`/`task-assignment`などの今後のspecで新しいテーブル・カラム（`groups`, `membership`等）を型安全に追加していく必要があるが、現状`todo-api/src/repositories/`配下の各リポジトリ（`todos.repository.ts`, `auth.repository.ts`）は`mysql2`による生SQLを個別に手書きしており、型安全性がなく、テーブル・リレーションが増えるほどSQLの書き間違いや型不整合による不具合のリスクが上がる。

そこでPrisma ORMを導入し、既存の`users`/`todos`テーブルのスキーマを`schema.prisma`に反映した上で、既存の全リポジトリ層のクエリをPrisma Clientベースに移行する。これにより、以降のスキーマ変更はPrismaのマイグレーション機構を通して型安全に行えるようになる。既存のAPIレスポンス形式・エラーハンドリング（`AppError`）・認可ロジックは変更せず、内部実装（データアクセス層）の置き換えのみを行う。DBエンジンはMySQLを継続使用する。

## Boundary Context (Optional)
- **In scope**: Prisma導入・設定、既存の`users`/`todos`テーブルの`schema.prisma`化、`TodoRepository`/`AuthRepository`（認証・管理者のロール/ステータス変更・プロフィールの表示名/パスワード変更を含む）のPrisma Clientベースへの移行、Prisma Migrateによるマイグレーション運用の確立
- **Out of scope**: 新規テーブル・カラムの追加（`groups`, `membership`等は`team-management`以降のspecの責務）、APIレスポンス形式の変更、既存の認可・バリデーションロジックの変更、DBエンジンの変更（MySQLを継続使用）
- **Adjacent expectations**: `SessionRepository`はRedisベースの実装であり`mysql2`/リレーショナルDBに依存しないため、このspecの対象外とする（コードベース確認により、ユーザーセッション追跡は`users`/`todos`テーブルとは独立したRedisインデックスとして実装されていることを確認済み）。既存spec（`admin-role`, `admin-user-management`, `session-invalidation`, `profile-screen`, `frontend-screen-tests`）が依存するAPI挙動は変更されないことを期待する

## Requirements

### Requirement 1: Prismaスキーマ定義
**Objective:** As a 開発者, I want 既存のMySQLスキーマをPrismaの`schema.prisma`として定義したい, so that 以降のスキーマ変更を型安全なマイグレーションで行える基盤を得られる

#### Acceptance Criteria
1. When 開発者がPrismaスキーマを生成する, the ORM Migration Foundation shall `users`テーブルの全カラム（id, email, password_hash, role, status, created_at, updated_at, name）を既存の型・NULL制約・デフォルト値・UNIQUE制約を保持したモデルとして定義する
2. When 開発者がPrismaスキーマを生成する, the ORM Migration Foundation shall `todos`テーブルの全カラム（id, user_id, title, status, created_at, updated_at）と`users`への外部キー制約（ON DELETE CASCADE）を保持したモデルとして定義する
3. The ORM Migration Foundation shall `users.role`と`users.status`の列挙値（'admin'/'member', 'active'/'disabled'）をPrismaのenum型として表現する
4. While Prismaスキーマが既存DBに適用される, the ORM Migration Foundation shall 既存データの列・型・制約に対してデータ損失を伴う破壊的変更（カラム削除・非互換な型変更）を発生させない

### Requirement 2: Todoデータアクセスの移行
**Objective:** As a 開発者, I want `TodoRepository`の全クエリをPrisma Clientベースに置き換えたい, so that 型安全性を確保しつつ既存のTodo機能の挙動を維持できる

#### Acceptance Criteria
1. When TodoServiceがユーザーの全Todoを取得する, the Todo Repository shall 移行前と同じ形式・内容のTodo一覧を返す
2. When TodoServiceが指定したidとuserIdでTodoを取得する, the Todo Repository shall 該当ユーザーが所有するTodoが存在すればそのTodoを返し、存在しなければnullを返す
3. When TodoServiceが新規Todoを作成する, the Todo Repository shall 指定されたtitle・userId・statusで新しいTodoレコードを作成する
4. When TodoServiceがTodoの部分更新（titleまたはstatusの一方または両方）を要求する, the Todo Repository shall 指定されたフィールドのみを更新し、指定されていないフィールドを変更しない
5. If 更新対象フィールドが1つも指定されない, then the Todo Repository shall データベースへの更新処理を実行しない
6. When TodoServiceがTodoの削除を要求する, the Todo Repository shall 指定したidとuserIdに一致するTodoを削除する
7. The Todo Repository shall 他ユーザーが所有するTodoに対する取得・更新・削除操作を成立させない（user_idスコープを常に適用する）

### Requirement 3: 認証・ユーザー管理データアクセスの移行
**Objective:** As a 開発者, I want `AuthRepository`の全クエリ（認証・管理者操作・プロフィール操作）をPrisma Clientベースに置き換えたい, so that 型安全性を確保しつつ既存の認証・管理・プロフィール機能の挙動を維持できる

#### Acceptance Criteria
1. When AuthServiceがメールアドレスでユーザーを検索する, the Auth Repository shall password_hashを含む一致するユーザーレコードを返す（一致しない場合はnull）
2. When AuthServiceがユーザーIDでユーザーを検索する, the Auth Repository shall password_hashを含まないユーザー情報を返す（一致しない場合はnull）
3. When 管理者向けのユーザー一覧が要求される, the Auth Repository shall password_hashを含まない全ユーザーの一覧を返す
4. When 新規ユーザー登録が要求される, the Auth Repository shall 指定されたemail・password_hash・nameで新しいユーザーレコードを作成する
5. When 管理者がユーザーのroleを降格方向（'member'）に変更する, the Auth Repository shall 対象ユーザー以外に有効な管理者（role='admin' かつ status='active'）が1人以上存在する場合に限り更新を成立させる
6. If ロール変更要求が降格であり、かつ対象ユーザー以外に有効な管理者が存在しない, then the Auth Repository shall 更新を成立させない
7. When 管理者がユーザーのstatusを無効化方向（'disabled'）に変更する, the Auth Repository shall 対象ユーザー以外に有効な管理者が1人以上存在する場合に限り更新を成立させる
8. If ステータス変更要求が無効化であり、かつ対象ユーザー以外に有効な管理者が存在しない, then the Auth Repository shall 更新を成立させない
9. When ロールまたはステータスの更新要求が対象ユーザーの現在の値と同一の値を指定する（冪等な再送）, the Auth Repository shall 呼び出し元に対して更新が成立したことを示す結果を返す
10. When ユーザーが表示名の変更を要求する, the Auth Repository shall 対象ユーザーのnameを更新する
11. When ユーザーがパスワード変更のための現在パスワード照合を要求する, the Auth Repository shall 対象ユーザーのpassword_hashのみを取得する
12. When ユーザーが新しいパスワードへの変更を要求する, the Auth Repository shall 対象ユーザーのpassword_hashを更新する

### Requirement 4: マイグレーション運用の確立
**Objective:** As a 開発者, I want Prisma Migrateによるマイグレーション運用を確立したい, so that 以降のspec（`team-management`等）がスキーマ変更を型安全かつ再現可能な手順で行える

#### Acceptance Criteria
1. The Migration Workflow shall 現在のDBスキーマ（`mysql/init.sql`が定義する状態）と同一の初期状態を表すベースラインマイグレーションを提供する
2. When 開発者が新しいスキーマ変更を作成する, the Migration Workflow shall その変更内容をバージョン管理可能なマイグレーションファイルとして記録する
3. When アプリケーションが開発環境または本番環境で起動される, the Migration Workflow shall 未適用のマイグレーションをDBに適用してからアプリケーションを起動する
4. The Migration Workflow shall 開発環境のdocker-compose構成上でマイグレーション適用手順を実行可能にする

### Requirement 5: 既存動作の非回帰保証
**Objective:** As a 開発チームメンバー, I want 移行前後でAPIの外部挙動が変わらないことを保証したい, so that 依存する既存機能（認証、Todo、管理者操作、プロフィール、セッション無効化）が壊れない

#### Acceptance Criteria
1. The system shall 移行後もAPIレスポンスの形式・内容を移行前と同一に保つ
2. The system shall 移行後も`AppError`によるエラーハンドリングの挙動（エラーメッセージ・ステータスコード）を移行前と同一に保つ
3. The system shall 移行後も既存の認可ロジック・バリデーションロジックを変更しない
4. While リポジトリ層の移行が進行中である, the system shall 既存のVitestテストスイートが継続して合格する状態を維持する
5. The system shall `SessionRepository`（Redisベースのセッション追跡）の実装を変更しない
