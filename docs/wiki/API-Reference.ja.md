# API Reference

*[English version here](API-Reference.md)*

ベースURL: dev環境では`http://localhost:3001`([Getting Started](Getting-Started.ja.md)参照)。全エンドポイントは`todo-api`(Fastify)上にあります。特記なき限り、リクエスト/レスポンスは全てJSONです。

`POST /auth/register`、`POST /auth/login`、`GET /`のヘルスチェックを除き、全エンドポイントでセッションCookie(`sessionId`)が必要です。ブラウザからは`credentials: "include"`を付けて送信してください。

## Auth

| メソッド & パス | 認証 | レート制限 | ボディ | 成功時 | エラー |
|---|---|---|---|---|---|
| `POST /auth/register` | 不要 | 5回/時/IP | `{ email, password }` | `201 { message }` | `400` 不正/重複メール |
| `POST /auth/login` | 不要 | 10回/15分/IP | `{ email, password }` | `200 { message }`、`sessionId` Cookieをセット | `401` 認証情報不正、`403` アカウント無効化済み |
| `POST /auth/logout` | セッション | グローバルのみ | — | `200 { message }`、Cookieをクリア | — (未ログインでも常に200) |
| `GET /auth/me` | セッション | グローバルのみ | — | `200 { id, email, role }` | `401` 未認証 |

## Todos

Todoの全エンドポイントは認証済みユーザー(`req.session.userId`)にスコープされています — 他人のTodoを見たり操作したりすることは決してできません([Todo Management](Todo-Management.ja.md#ユーザーごとのデータ分離)参照)。

| メソッド & パス | ボディ | 成功時 | エラー |
|---|---|---|---|
| `GET /todos` | — | `200 [Todo, ...]` | `401` セッションなし |
| `GET /todos/:id` | — | `200 Todo` | `401`、`404` 存在しない/自分のものでない |
| `POST /todos` | `{ title }`(1〜100文字) | `201 { message }` | `400` 不正なボディ、`401` |
| `PATCH /todos/:id` | `{ title? , status? }`(最低1つ必須。`status`は`0`か`1`) | `200 { message }` | `400`、`401`、`404` |
| `DELETE /todos/:id` | — | `200 { message }` | `401`、`404` |

`Todo`の形: `{ id, title, status, created_at, updated_at }` — [Database Schema](Database-Schema.ja.md)参照。

## Admin — ユーザー管理

`/admin/*`の全ルートは認証済みの**管理者**セッションを必要とします(`adminOnlyGuard` — [Admin & User Management](Admin-User-Management.ja.md#認可-adminonlyguard)参照)。

| メソッド & パス | ボディ | 成功時 | エラー |
|---|---|---|---|
| `GET /admin/users` | — | `200 [User, ...]` | `401`、`403` 非管理者 |
| `PATCH /admin/users/:userId/role` | `{ role: "admin" \| "member" }` | `200 { message: "role updated" }` | `401`、`403`、`404` 該当ユーザーなし、`409` 有効な管理者が0人になってしまう |
| `PATCH /admin/users/:userId/status` | `{ status: "active" \| "disabled" }` | `200 { invalidatedCount }` | `401`、`403`、`404`、`409` |
| `DELETE /admin/sessions/:userId` | — | `200 { invalidatedCount }` | `401`、`403` |

`User`の形: `{ id, email, role, status }` — `password_hash`は決して含まれません。

`invalidatedCount`と`409`不変条件の実際の意味については[Admin & User Management](Admin-User-Management.ja.md)を参照してください。

## バリデーションルール

JSON SchemaはFastifyのルート(`schema.body` / `schema.params`)に適用されており、不正なリクエストはハンドラーやビジネスロジックが実行される**前に**`400`で拒否されます。

| フィールド | ルール |
|---|---|
| `email` | AJVの`format: "email"`、最大255文字 |
| `password` | 8〜128文字、大文字1文字以上・数字1文字以上を含む必要がある — パターン`^(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$` |
| `todos.title` | 1〜100文字 |
| `todos.status` | 整数、`0`または`1` |
| `role` | enum `admin` \| `member` |
| `status`(アカウント) | enum `active` \| `disabled` |

全てのリクエストボディスキーマは`additionalProperties: false`を設定しています。Fastify 5の既定のAJV設定`removeAdditional: true`と組み合わさることで、想定外のフィールドは**拒否されるのではなく黙って取り除かれます** — `400`が「未知のフィールドがある」ことを教えてくれるわけではなく、ハンドラーに届く頃にはそのフィールドは既に消えています。これが重要な理由は[Authentication & Sessions](Authentication-and-Sessions.ja.md#登録register)のrole紛れ込み防止の注記を参照してください。

## エラーの形式

全てのエラーレスポンスは`{ "message": string }`です。アプリケーションレベルのエラー(`AppError`)は自身の`statusCode`を持ちます。それ以外の予期しないエラーはサーバー側でログに記録され、クライアントには内部の詳細を漏らすことなく`500 { message: "Internal Server Error" }`として返されます。

## レート制限

`@fastify/rate-limit`、IP(`req.ip`)単位:

| 対象 | 上限 |
|---|---|
| グローバル(全ルート) | 200リクエスト/分 |
| `POST /auth/login` | 10リクエスト/15分 |
| `POST /auth/register` | 5リクエスト/時 |

上限を超えると`429`が返ります。

## CORS

`app.ts`で設定: `process.env.CORS_ORIGIN`(既定は`http://localhost:3000`)のみが、認証情報付きでAPIを呼び出せます。許可されるメソッド: `GET, POST, PATCH, DELETE, OPTIONS`。
