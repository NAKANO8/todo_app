# Brief: orm-migration

## Problem
開発者は、`groups`/`membership`のような複数テーブルにまたがるリレーションを今後追加していく必要があるが、現状は`mysql2`による生SQLを各リポジトリ層で個別に書いており、型安全性がない。テーブル数・リレーションが増えるほど、SQLの書き間違いや型不整合による不具合のリスクが上がる。

## Current State
`todo-api/src/repositories/`配下で`mysql2`を直接使い、SQL文字列をリポジトリごとに手書きしている（`todos.repository.ts`, `auth.repository.ts`等）。マイグレーションの仕組みも現状は明文化されていない。

## Desired Outcome
Prisma ORMを導入し、既存の全リポジトリ層のクエリをPrisma Clientベースに移行する。以降のスキーマ変更（`team-management`以降のspec）は、Prismaのマイグレーション機構を通して型安全に行えるようになる。

## Approach
既存のDBスキーマをPrismaの`schema.prisma`に反映し（`prisma db pull`または手動定義）、リポジトリ層を1つずつPrisma Clientベースに置き換える。既存のAPI挙動・レスポンス形式は変更しない（内部実装の置き換えのみ）。

## Scope
- **In**: Prismaの導入・設定、既存スキーマの`schema.prisma`化、既存リポジトリ層（todos, auth, admin.user, profile, admin.session）のPrisma Client移行、マイグレーション運用方法の確立
- **Out**: 新しいテーブル・カラムの追加（`team-management`以降のspecの責務）、APIレスポンス形式の変更、既存の認可・バリデーションロジックの変更

## Boundary Candidates
- リポジトリ層ごとの移行（todos / auth / admin.user / profile / admin.session）
- マイグレーション運用（Prisma Migrate導入とCI/デプロイフローへの組み込み）

## Out of Boundary
- 新規テーブル設計（groups, membership等）はこのspecでは行わない
- 既存のテスト（Vitest）の書き換えは、Prisma移行に伴う最小限の修正にとどめる

## Upstream / Downstream
- **Upstream**: なし（既存の全実装済みspecの上に乗る技術的な土台）
- **Downstream**: `team-management`, `task-status-model`, `task-rot-detection`, `redmine-integration`の全てが、このspec完了後のPrismaベースのスキーマ変更を前提とする

## Existing Spec Touchpoints
- **Extends**: なし（横断的な技術基盤の入れ替え）
- **Adjacent**: 既存の全spec（admin-role, admin-user-management, session-invalidation, profile-screen, frontend-screen-tests）のAPI挙動を変えずに内部実装のみ置き換える

## Constraints
- 既存のAPIレスポンス・エラーハンドリング（`AppError`）の挙動を変更しないこと
- MySQL 2を継続使用（DB自体の変更は行わない）
- 移行中も既存機能のテストが通り続けること
