# Research & Design Decisions

## Summary
- **Feature**: `admin-user-management`
- **Discovery Scope**: Extension（既存の`admin-role`・`session-invalidation`基盤の上に構築）
- **Key Findings**:
  - ユーザー参照・更新は専用の「users」層ではなく`todo-api/src/repositories/auth.repository.ts`に集約されている。新規に並行するリポジトリを作ると同一テーブルへの二重所有になるため、既存`AuthRepository`を拡張する。
  - 管理者ロールチェック（`role === "admin"`）は`admin.session.route.ts`にインライン実装のみが存在し、共有ガードとして切り出されていない。本specで2件目の利用箇所ができるため、この時点で共有化する。
  - アカウント状態（有効/無効）の概念はDBに一切存在しない（`mysql/init.sql`に`status`等のカラムなし）。`role`カラムと同じ手法（ENUM + NOT NULL DEFAULT）で追加するのが既存パターンとの一貫性が高い。
  - 強制ログアウトの実体（`SessionService.invalidateUserSessions`）は`session-invalidation` specで完成済みで、権限チェックを行わない前提で作られている。本specはこれを呼び出すだけでよく、再実装は不要。

## Research Log

### 既存のユーザー関連コードの所在
- **Context**: ユーザー一覧・ロール変更・無効化をどこに実装すべきか判断するため、既存のuser関連コードを調査した。
- **Sources Consulted**: `todo-api/src/repositories/auth.repository.ts`, `services/auth.service.ts`, `controllers/auth.controller.ts`, `errors/AppError.ts`
- **Findings**:
  - `AuthRepository`（`repositories/auth.repository.ts:18-41`）が`users`テーブルへの唯一のアクセス経路。`findByEmail`・`findById`・`createUser`のみで、一覧取得・更新系メソッドは存在しない。
  - `User`型・`UserRole`型は同ファイル内で定義・export済み（`admin-role` specが追加）。
  - `AppError`（`errors/AppError.ts`）は`message`と`statusCode`のみを持つ最小限の型。エラーコード体系は存在せず、コントローラー側で`instanceof AppError`判定のみ行う。
- **Implications**: 新規に並行する`users`リポジトリ/サービスを作らず、`AuthRepository`にメソッドを追加する形で拡張する（Simplification: 同じテーブルの所有権を割らない）。新しい業務ロジック（一覧・ロール変更・無効化・再有効化・自己保護）は`AuthService`とは責務が異なる（自己認証 vs 他者管理）ため、新規`AdminUserService`として分離する。

### 管理者ガードの再利用可能性
- **Context**: 「管理者のみ許可」の判定（Requirement 6）をどう実装するか。
- **Sources Consulted**: `todo-api/src/routes/admin.session.route.ts:16-27`
- **Findings**: 既存の管理者ガードはルートファイル内にインラインの`preHandler`として実装されており、他ファイルからimportできる共有関数になっていない。
- **Implications**: 本specで2つ目の管理者専用ルートファイルを追加するため、このタイミングでガードを`todo-api/src/guards/adminOnly.ts`に切り出し、`admin.session.route.ts`と新規`admin.user.route.ts`の両方から利用する（Generalization: 同一責務の2箇所目の出現で共通化する）。`admin.session.route.ts`側の変更は「同じインライン処理を共有関数のimportに置き換えるだけ」の機械的な変更であり、既存の振る舞い（401/403判定）は変えない。

### アカウント状態カラムの設計
- **Context**: 「有効/無効」をどう永続化するか。
- **Findings**: `role`カラムは`ENUM('admin','member') NOT NULL DEFAULT 'member'`として追加されている（`mysql/init.sql`）。同じ手法（ENUM + NOT NULL DEFAULT）を`status`にも適用すれば、既存の型安全パターン（`UserRole`のような`AccountStatus`型）を横展開できる。
- **Implications**: `status ENUM('active','disabled') NOT NULL DEFAULT 'active'`を追加する。既定値により、新規登録（Requirement 3.1）・導入前アカウント（Requirement 3.2）の両方が自動的に「有効」になり、追加のバックフィル処理は不要。

### 無効化時の強制ログアウトの連携方法
- **Context**: Requirement 4.2（無効化時に既存セッションを強制終了）をどう実現するか。
- **Sources Consulted**: `todo-api/src/services/session.service.ts`, `controllers/admin.session.controller.ts:14-22`
- **Findings**: `SessionService.invalidateUserSessions(targetUserId)`は権限チェックを行わない前提で作られており、呼び出し元が既に管理者確認済みであることを期待する。また、無効化対象が呼び出し元自身の場合、`@fastify/session`の自動再保存(`onSend`)がセッションを復活させてしまうため、`admin.session.controller.ts`は`req.session.destroy()`を明示的に呼んでいる。
- **Implications**: `AdminUserService.changeStatus`が`disabled`への変更時に`SessionService.invalidateUserSessions`を呼び出す。コントローラー層で、対象が呼び出し元自身だった場合は同じ`req.session.destroy()`パターンを適用する（Build vs Adopt: 既存の解決策をそのまま再利用、新規実装しない）。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| `AuthRepository`拡張（採用） | 既存リポジトリにメソッド追加 | テーブル所有権が単一箇所に保たれる | ファイルが肥大化する可能性 | 現状4メソッド→8メソッド程度、許容範囲 |
| 新規`users.repository.ts` | 並行するリポジトリを新設 | ファイル分割は綺麗 | 同一テーブルの二重所有、`User`/`UserRole`型の重複か再export | 不採用 |
| ロール変更・無効化を別々のエンドポイントに分割 | disable/enable/role-changeを個別API化 | 各エンドポイントの責務が単純 | 無効化と再有効化は同じ状態遷移の両方向であり、エンドポイントを分けると2つの薄いハンドラが増えるだけ | 不採用: `PATCH /admin/users/:userId/status`に統合 |

## Design Decisions

### Decision: 管理者ガードの共有化
- **Context**: Requirement 6（管理者以外の操作拒否）を、一覧参照・ロール変更・無効化・再有効化の4操作すべてに一貫して適用する必要がある。
- **Alternatives Considered**:
  1. `admin.user.route.ts`に同じインラインチェックをコピーする
  2. `todo-api/src/guards/adminOnly.ts`に共通化し、既存`admin.session.route.ts`も含めて両方から利用する
- **Selected Approach**: 2を採用。
- **Rationale**: 同一の権限判定ロジックが3ルートファイル（既存1+新規2 route plugin単位では2ファイル）に散在する状態を避ける。design-principles.mdの「No Hidden Shared Ownership」に基づき、2箇所目の出現時点で共通化する。
- **Trade-offs**: `admin.session.route.ts`（別specの成果物）に軽微な変更が入るが、振る舞いは変えない機械的な置き換えのみ。
- **Follow-up**: 実装時、既存の`admin.session.api.test.ts`が変更後も全て green であることを確認する。

### Decision: ロール変更・無効化・再有効化を状態更新APIとして統合
- **Context**: 無効化（Requirement 4）と再有効化（Requirement 5）は同じ「アカウント状態」という値の両方向の遷移である。
- **Alternatives Considered**:
  1. `DELETE /admin/users/:userId`（無効化）+ `POST /admin/users/:userId/reactivate`（再有効化）
  2. `PATCH /admin/users/:userId/status` body `{ status: "active" | "disabled" }`
- **Selected Approach**: 2を採用。
- **Rationale**: 既存の`todos.route.ts`の`PATCH /todos/:id`（`status`を含む部分更新）と同じ設計言語。エンドポイント数を増やさずに済む（Simplification）。
- **Trade-offs**: クライアント側は「無効化」ボタンと「再有効化」ボタンで送る`status`値を分けるだけで済み、UI実装への影響は小さい。

### Decision: 無効化アカウントのログイン拒否タイミング
- **Context**: Requirement 4.3（無効化されたアカウントでのログイン拒否）をどこで判定するか。
- **Alternatives Considered**:
  1. `AuthService.login`内でパスワード一致確認後に`status`をチェック
  2. セッション作成後、`todos`等の各ルートガードで都度`status`を確認
- **Selected Approach**: 1を採用。
- **Rationale**: ログイン時点で止めるのが最も早く、かつ既存の`AuthService.login`が既にユーザー行を取得済みで追加クエリが不要。既存の認証済みセッションに対する無効化はRequirement 4.2の強制ログアウトで別途カバーされるため、各ルートで都度`status`を見る仕組みは不要（session-invalidationの責務と重複させない）。
- **Trade-offs**: なし（既存フローへの1条件分岐追加のみ）。

## Risks & Mitigations
- **Risk**: `admin.session.route.ts`のガード共通化が既存テストを壊す可能性 — **Mitigation**: 既存の`admin.session.api.test.ts`をリグレッションとして実行し、挙動が変わっていないことを確認する。
- **Risk**: 最後の管理者保護のカウントロジックが、無効化済みの管理者を「有効な管理者」として誤って数えるとロックアウトを防げない — **Mitigation**: カウント対象を「`role = admin` かつ `status = active`」に限定する。
- **Risk**: `todo-web/middleware.ts`のロール判定追加により、既存の認証キャッシュ（TTL 3秒）の挙動が変わる可能性 — **Mitigation**: キャッシュキーの構造は変えず、キャッシュ値に`role`を追加するのみに留める。

## References
- `.kiro/specs/admin-role/requirements.md` — roleカラムの前提
- `.kiro/specs/session-invalidation/requirements.md` — 強制セッション無効化の前提
