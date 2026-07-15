# Research & Design Decisions

## Summary
- **Feature**: `profile-screen`
- **Discovery Scope**: Extension（既存の認証・セッション基盤への追加）
- **Key Findings**:
  - `users`テーブルの変更は`init.sql`のみが唯一のスキーマソースであり、正式なマイグレーションツールは存在しない（`docs/wiki/Database-Schema.md`で明記済み、`admin-role`/`admin-user-management`specでも同じ制約下でカラム追加を実施済み）
  - `SessionService.invalidateUserSessions`は対象ユーザーの**全セッション**（呼び出し元自身のセッションを含む）をRedis上から削除する。「自分以外を無効化」という専用機能は存在しない
  - `@fastify/session`は、`req.session.destroy()`を明示的に呼ばない限り、レスポンス送信時（onSendフック）に現在の`req.session`を自動的に再保存する。この挙動は`admin.session.controller.ts`・`adminUser.controller.ts`の両方で「自己ターゲット時に再保存を止めるため`destroy()`を呼ぶ」という形で既に文書化・活用されている

## Research Log

### `users`テーブルへのカラム追加とマイグレーション手段
- **Context**: `name`カラムをNOT NULLで追加しつつ、導入前から存在する行にも値を持たせる必要がある（Requirement 3, 4）
- **Sources Consulted**: `mysql/init.sql`、`docs/wiki/Database-Schema.md`、`.kiro/specs/admin-role/design.md`、`.kiro/specs/admin-user-management/design.md`
- **Findings**:
  - `init.sql`はDocker Compose初回起動時（空DB）にのみ実行される
  - 既存のdev/staging/本番DBには手動`ALTER TABLE`が必要（`role`/`status`カラム追加時と同じ運用）
  - MySQLの`SUBSTRING_INDEX(str, delim, count)`関数で、追加のアプリケーションコードなしにSQLのみで「emailの`@`より前の部分」を導出できる
- **Implications**: `role`/`status`追加時と同じ「手動デプロイ手順」として扱う。ただし`role`/`status`はNULL許容にせずDEFAULT値で即座に確定できたのに対し、`name`はDEFAULT定数ではなく行ごとに異なる導出値が必要なため、追加時は一時的にNULL許容にしてバックフィルしてからNOT NULL化する3ステップが必要（Data Models参照）

### `SessionService.invalidateUserSessions`と「自分のセッションだけ残す」の両立
- **Context**: Requirement 6は「変更成功時、操作を行った本人以外の全セッションを終了し、本人のセッションは維持する」ことを求める
- **Sources Consulted**: `todo-api/src/services/session.service.ts`、`todo-api/src/repositories/session.repository.ts`、`todo-api/src/controllers/admin.session.controller.ts`、`todo-api/src/controllers/adminUser.controller.ts`
- **Findings**:
  - `invalidateUserSessions(userId)`は対象ユーザーの**全**セッションIDを`listSessionIds`で取得し、それぞれを`destroySession`した上で索引全体を`clearIndex`する。「除外するsessionId」を渡すパラメータは存在しない
  - `req.session`が生きている限り（`destroy()`されない限り）、`@fastify/session`はレスポンス送信時に現在のセッションをストアへ再保存する。この「復活」現象は`admin.session.controller.ts`・`adminUser.controller.ts`の両方で既に文書化されており、それらは逆に「復活させたくない」ケースのため明示的に`destroy()`を呼んで止めている
  - ただし`clearIndex`は索引（`user-sessions:<userId>`）全体を削除するため、「復活」したセッションのIDはこの索引に含まれない状態になる。再登録しない限り、将来管理者がこのユーザーを強制無効化しようとした際に、この生き残ったセッションが`listSessionIds`に含まれず無効化対象から漏れる
- **Implications**: `SessionService`のシグネチャは変更しない（`admin-user-management`のAllowed Dependencyを維持）。代わりに`ProfileController`が、`invalidateUserSessions`呼び出し後に**明示的に現在のセッションを`SessionRepository.trackSession`で再登録**する。「何もしない」だけでは索引が不整合になるため、この再登録がRequirement 6の正しい実装に必須

### 新規登録フォームへの`name`追加
- **Context**: Requirement 3は登録時のname必須入力を求める
- **Sources Consulted**: `todo-web/features/auth/LoginForm.tsx`、`todo-web/app/api/auth/register/route.ts`
- **Findings**: 登録フォームはネイティブ`<form action="/api/auth/register" method="POST">`によるフルページ遷移で、`LoginForm.tsx`は`mode="login"|"register"`で1コンポーネントを共有している。プロキシルート（`app/api/auth/register/route.ts`）は`formData`からフィールドを取り出しJSONに変換してFastifyへ転送する
- **Implications**: `LoginForm.tsx`に`mode==="register"`時のみ表示する`name`入力欄を追加し、プロキシルートで`formData.get("name")`を追加で転送する。エラー時の遷移先（`/register?error=register_failed`）は既存のまま変更しない（理由の細分化は本specの要件外）

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 新規`GET /profile`エンドポイント | プロフィール画面専用の読み取りAPIを新設 | 画面の意図が明確 | 既存`/auth/me`と実質同じ情報を返す重複エンドポイント | 不採用 |
| `/auth/me`拡張（採用） | 既存の`/auth/me`レスポンスに`name`を追加するのみ | 新規エンドポイント不要、`fetchMe()`をそのまま再利用可能 | なし（`role`/`status`同様、既存の拡張パターンを踏襲） | 採用 |

## Design Decisions

### Decision: プロフィール読み取りは新規エンドポイントを作らず`/auth/me`を拡張する
- **Context**: 表示名を画面に表示するための読み取り手段が必要（Requirement 1）
- **Alternatives Considered**:
  1. `GET /profile`を新設し、`name`を含むレスポンスを返す
  2. 既存`/auth/me`（`AuthRepository.findById`が返す`id, email, role, status`）に`name`を追加する
- **Selected Approach**: 案2。`findById`のSELECT列に`name`を追加し、`AuthController.me`のレスポンスに含める
- **Rationale**: `/auth/me`は既にmiddlewareとフロントエンド双方から「現在の認証済みユーザー情報」を取得する唯一の窓口として使われており（`role`追加時も同じ拡張パターンを採用済み）、同じ情報を返す別エンドポイントを増やすことは重複を生むだけで、シンプリフィケーションの原則に反する
- **Trade-offs**: なし（既存呼び出し元とのレスポンス形状互換性は保たれる。フィールド追加のみで既存フィールドは変更しない）
- **Follow-up**: なし

### Decision: パスワード変更後の「自分のセッションだけ残す」は`SessionService`を変更せず、呼び出し側で再登録する
- **Context**: Requirement 6（他セッション終了・本人セッション維持）
- **Alternatives Considered**:
  1. `SessionService.invalidateUserSessions`に`exceptSessionId`パラメータを追加する
  2. 既存の`invalidateUserSessions`をそのまま呼び、`req.session.destroy()`を呼ばない（＝自動再保存に任せる）ことで本人セッションを存続させ、`ProfileController`が明示的に`SessionRepository.trackSession`で索引に再登録する
- **Selected Approach**: 案2
- **Rationale**: 案1は`admin-user-management`のBoundary Commitmentsが「シグネチャ・戻り値型を変更せずに呼び出す」ことをAllowed Dependencyとして明記しており、変更するとRevalidation Triggerに該当し`admin-user-management`側の再検証が必要になる。案2は既存の「破棄しなければ自動再保存される」という、このコードベースで既に2箇所（`admin.session.controller.ts`, `adminUser.controller.ts`）で活用されている挙動をそのまま利用でき、`SessionService`のインターフェースに触れずに済む
- **Trade-offs**: 案2は「索引への再登録を忘れる」という実装ミスの余地が残る（`SessionService`側で保証されないため）。この点はdesign.mdのComponents & InterfacesとTesting Strategyで明示し、実装・レビュー双方で確認する
- **Follow-up**: 実装タスクのObservableに「パスワード変更後、他デバイスのセッションは無効化され、変更を行った本人のセッションは維持され、かつ管理者による強制無効化の対象に含まれ続けること」を含める

## Risks & Mitigations
- **索引再登録漏れ**: `ProfileController.changePassword`が`SessionRepository.trackSession`の呼び出しを忘れると、生き残った本人セッションが将来の管理者強制無効化から漏れる — Testing Strategyに専用の統合テストを設ける
- **デプロイ順序**: `name`カラム追加（NOT NULL化含む）より先に新アプリコードがデプロイされると、`findById`等の`SELECT`が存在しない列を参照し全ユーザーのログイン・`/auth/me`が失敗しうる（`role`/`status`追加時と同種のリスク） — Data Models / Migration Strategyで明示し、デプロイ手順書に順序を明記する
- **IDOR**: 実装時に利便性のため`userId`をリクエストに含めてしまうと、他ユーザーの表示名・パスワードを変更できてしまう — エンドポイント自体を`userId`を一切受け取らない形状（`PATCH /profile/name`, `PATCH /profile/password`）にすることで、この経路自体を構造的に排除する

## References
- `.kiro/specs/admin-user-management/design.md` — カラム追加・セッション連携・IDOR対策の既存パターン
- `docs/wiki/Database-Schema.md` — 手動マイグレーション運用の確認
