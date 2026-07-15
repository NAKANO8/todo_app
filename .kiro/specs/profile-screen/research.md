# Research & Design Decisions

## Summary
- **Feature**: `profile-screen`
- **Discovery Scope**: Extension（既存のauth周りの認証基盤を拡張する。新規外部ライブラリ・新規ドメインの追加はなし）
- **Key Findings**:
  - `SessionService.invalidateUserSessions(userId)`は対象ユーザーの全セッションを無条件に破棄する実装で、「現在のセッションだけは除外する」ためのパラメータが存在しない。パスワード変更後に他セッションのみ無効化するには、この共有サービスの拡張が必要
  - パスワードの強度要件（8文字以上・大文字1文字以上・数字1文字以上）は現状フロントエンド（`lib/validation.ts`）にしか存在せず、`AuthService.register`はサーバー側で強度チェックを一切行っていない。パスワード変更ではAPIを直接叩かれても要件3.3を満たす必要があるため、サーバー側にも同等のチェックを追加する
  - ユーザー間でデータをやり取りする通常操作（todos、admin-user-managementのユーザー一覧・状態変更）は、Next.jsのAPI Routeを経由せずブラウザから直接Fastifyへ`fetch`する既存パターンが確立している（`docs/architecture.md`参照）。プロフィール画面の操作もページ遷移を伴わないため、この直接fetchパターンに従うのが一貫している（ログイン/登録/ログアウトのform+BFFプロキシパターンは対象外）

## Research Log

### SessionServiceの「自分以外のセッションを無効化する」対応可否
- **Context**: 要件3.4/3.5（パスワード変更成功時、変更操作を行ったセッション以外を無効化しつつ、本人の現在のセッションは維持する）を満たす実装方法の調査
- **Sources Consulted**: `todo-api/src/services/session.service.ts`, `todo-api/src/repositories/session.repository.ts`
- **Findings**:
  - `invalidateUserSessions`は`listSessionIds` → 全件`destroySession` → `clearIndex`という実装で、除外パラメータを持たない
  - `SessionRepository`には既に`untrackSession(userId, sessionId)`（索引から特定の1件だけ除去するメソッド）が存在し、除外ロジックの実装に転用できる
- **Implications**: `invalidateUserSessions`に任意の`excludeSessionId`パラメータ（省略時は現行動作と同一、後方互換）を追加することで、既存の呼び出し元（admin-user-managementの`changeStatus`）に影響を与えずに要件を満たせる

### パスワード強度のサーバー側検証の有無
- **Context**: 要件3.3（新パスワードが登録時と同じ強度要件を満たさない場合は拒否）をAPIレベルで満たせるか確認
- **Sources Consulted**: `todo-api/src/services/auth.service.ts`（`register`)、`todo-web/lib/validation.ts`
- **Findings**: `AuthService.register`は`!email || !password`（存在確認）のみを行い、強度チェック(`passwordRegex`)はフロントエンドにしか実装されていない
- **Implications**: 本specのパスワード変更エンドポイントでは、フロントと同一の正規表現（`/^(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/`）をサーバー側（service層）でも検証する。登録時の同種の欠落は本specのOut of Boundaryとし、修正しない（別途ロードマップ側の課題とする）

### 既存の直接fetch vs BFFプロキシパターンの使い分け
- **Context**: プロフィール画面のAPI呼び出し方式をどちらのパターンに合わせるか
- **Sources Consulted**: `docs/architecture.md`、`todo-web/lib/api/todos.ts`、`todo-web/lib/api/adminUsers.ts`
- **Findings**: このプロジェクトの既存ルールは「ページ遷移が適切な操作はform+BFFプロキシ、そうでない操作は直接fetch」。名前変更・パスワード変更はいずれも画面遷移を伴わずその場で結果を反映する想定
- **Implications**: `todo-web/lib/api/profile.ts`を新設し、`lib/api/todos.ts`/`adminUsers.ts`と同じ直接fetchパターン（`credentials: "include"`、`NEXT_PUBLIC_API_BASE`）に従う

## Design Decisions

### Decision: SessionService.invalidateUserSessionsに任意のexcludeSessionIdを追加する
- **Context**: パスワード変更成功時、変更を行った本人の現在のセッションだけは維持したまま、他の全セッションを無効化する必要がある
- **Alternatives Considered**:
  1. 既存の`invalidateUserSessions`をそのまま呼び、その後で現在のセッションを作り直す（re-login相当の処理をサーバー側で再現する） — セッション再生成のロジックが複雑になり、`@fastify/session`の内部動作に依存する脆い実装になる
  2. パスワード変更専用の全く別の無効化ロジックをprofile側に複製する — `SessionRepository`のロジックと重複し、二重管理になる
  3. `invalidateUserSessions`に`excludeSessionId`（省略可）を追加する
- **Selected Approach**: 3。既存の`untrackSession`を使い、除外対象を`listSessionIds`結果からフィルタしてから破棄・索引更新する
- **Rationale**: 既存呼び出し元（admin-user-managementの`changeStatus`）は引数を渡さないため挙動が変わらず後方互換。ロジックの二重管理も避けられる
- **Trade-offs**: session-invalidation spec（既にshipped）が定義した共有関数のシグネチャを変更するため、admin-user-management design.mdが明記する「Revalidation Trigger」に該当する。ただし追加のみで既存呼び出しへの破壊的変更はない
- **Follow-up**: 実装時、admin-user-management側の`changeStatus`呼び出しが影響を受けないことをテストで再確認する

### Decision: 新パスワードの強度チェックをJSON Schemaではなくservice層で行う
- **Context**: 要件3.3を満たす実装場所の選択
- **Alternatives Considered**:
  1. Fastify route schemaの`pattern`でAJVに強度チェックさせる — 失敗時のエラーメッセージがAJVの生の文言になり、admin-user-managementで統一した「理由が分かるエラーメッセージ」の方針と整合しない
  2. service層で正規表現チェックし`AppError`で理由を明示する
- **Selected Approach**: 2
- **Rationale**: ログイン失敗時の`AppError('invalid credentials', 401)`等、既存のエラーハンドリング規約（service層で`AppError`を投げ、controllerが`{message}`として返す）と一貫する
- **Trade-offs**: schemaレベルの型・必須チェックとservice層のビジネスルールチェックが2箇所に分かれるが、既存の`AuthService.login`（status確認をservice層で行う）と同じ構成であり許容範囲

## Risks & Mitigations
- `name`カラム追加後、本番デプロイまでの間に新コードが先行すると`user.name`が`undefined`になる — ただしログイン等の必須フローはstatus/roleと異なり`name`を無条件参照しないため、影響は「名前欄が空に見える」程度に限定される。念のため`status`カラム追加時と同じ順序（マイグレーション→デプロイ）を踏襲する
- `excludeSessionId`のフィルタ処理でRedis呼び出し回数が増える（`untrackSession`を破棄件数分呼ぶ）が、通常1ユーザーあたりのセッション数は小さいため性能上のリスクは低い

## References
- [docs/architecture.md](../../../docs/architecture.md) — 既存の3パターン（form+BFFプロキシ／直接fetch／middleware認可ゲート）の使い分けルール
