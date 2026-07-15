# Getting Started

*[English version here](Getting-Started.md)*

フルスタック(API + web + MySQL + Redis)をローカルで動かす方法です。

## 前提条件

- [Node.js](https://nodejs.org/) v20以上
- [pnpm](https://pnpm.io/installation) v11 — `npm install -g pnpm`
- [Docker](https://docs.docker.com/engine/install/) v29以上

## 1. クローンと設定

```bash
git clone https://github.com/NAKANO8/todo_app.git
cd todo_app
cp todo-api/.env.dev.example todo-api/.env.dev
```

`todo-api/.env.dev` を編集し、シークレット類に実際の値を設定してください — サンプルファイルはパスワード欄が空のまま配布されています。

| 変数 | 用途 |
|---|---|
| `DB_PASSWORD` / `MYSQL_PASSWORD` | MySQLアプリ用ユーザーのパスワード |
| `MYSQL_ROOT_PASSWORD` | MySQL rootパスワード(コンテナ初期化時のみ使用) |
| `SESSION_SECRET` | セッションCookieの署名鍵 — 十分長いランダム文字列であれば何でも可 |
| `REDIS_HOST` / `REDIS_PORT` | 既定は `redis` サービス / `6379`。同梱のDocker Redisを使わない場合のみ変更 |

## 2. スタックの起動

```bash
pnpm docker:dev-init   # 初回 — イメージをビルドし、API + web + MySQL + Redisを起動
pnpm docker:dev        # 2回目以降 — ビルドなしで起動
```

これで4つのコンテナが起動します(構成の詳細は[Deployment & Operations](Deployment-and-Operations.ja.md)を参照):

| サービス | ポート | 役割 |
|---|---|---|
| `web` | 3000 | Next.jsフロントエンド |
| `api` | 3001 | Fastify REST API |
| `db` | 3306 | MySQL 8.0 — スキーマは `mysql/init.sql` から一度だけ読み込まれる |
| `redis` | 6379 | セッションストア([Authentication & Sessions](Authentication-and-Sessions.ja.md)参照) |

**http://localhost:3000** を開いてください。

## 3. 初回の使い方

1. **新規登録 (Register)** をクリックしてアカウントを作成
2. メールアドレスとパスワードでログイン
3. Todoの追加・完了・削除

新規アカウントは `role = member`、`status = active` で作成されます — 最初の管理者を作る方法は[Admin & User Management](Admin-User-Management.ja.md#最初の管理者を作る)を参照してください。

## テストの実行

```bash
cd todo-api && pnpm test   # Vitest — API側のみ。todo-webにも_test_/配下にコンポーネントテストはあるが、CIには未接続
```

## トラブルシューティング

**ポートが既に使用中** — 3000/3001/3306/6379のいずれかを他のプロセスが使用しています。そのプロセスを止めるか、`docker-compose.dev.yml` のポート番号を変更してください。

**初回起動時にDBへ接続できない** — MySQLの初期化には10〜20秒ほどかかります。`api` コンテナはヘルスチェックを待つ設定になっている(`docker-compose.yml`)ので、通常は自然に解決します。解決しない場合は `docker compose logs db` を確認してください。

**スキーマの変更が反映されない** — `mysql/init.sql` は**空のデータボリューム**に対してのみ実行されます。一度でも `db` コンテナを起動していると、`init.sql` の変更は再適用されません。強制的に再初期化するにはボリュームを削除する(`docker compose down -v`)か、手動で変更を適用してください — [Database Schema](Database-Schema.ja.md#マイグレーションに関する注意)を参照。

**ログイン済みなのに突然 `/login` にリダイレクトされる** — セッションはRedis上にありストア側ではTTLが設定されていません([Authentication & Sessions](Authentication-and-Sessions.ja.md)参照)。Redisをフラッシュした場合(設定によっては `docker compose restart redis` でデータが消えることがある)、ブラウザにCookieが残っていてもセッション自体は失われています。

## 情報源

セットアップ手順は[`docs/README.md`](https://github.com/NAKANO8/todo_app/blob/main/docs/README.md)と[`docs/CONTRIBUTING.md`](https://github.com/NAKANO8/todo_app/blob/main/docs/CONTRIBUTING.md)(英語)の内容に沿っています — もしそれらとこのページの内容がずれていたら、リポジトリ本体のドキュメントを正としてこのページを直してください。
