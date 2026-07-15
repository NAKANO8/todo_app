# Todo App Wiki

*[English version here](Home.md)*

このWikiは、**Todo Appが実際にどう動いているか**をまとめたものです。アプリを使う人にも、開発する人にも向けています。[README](https://github.com/NAKANO8/todo_app/blob/main/docs/README.md)が*セットアップ*を扱うのに対し、このWikiは*振る舞い*にフォーカスします — リクエストの流れ、守られている不変条件、そして一見わかりにくい設計判断の理由です。

Todo Appは、セッション認証・レイヤードアーキテクチャ・ロールベースの管理者機能といった、実運用レベルのパターンを小さく理解しやすいコードベースで実践するために作られた、Fastify製APIとNext.js製フロントエンドから成るフルスタックTodoアプリです。

## ページ一覧

| ページ | 対象 | 内容 |
|---|---|---|
| [Getting Started](Getting-Started.ja.md) | 開発者 | ローカル環境構築、環境変数、起動方法 |
| [Architecture](Architecture.ja.md) | 開発者 | モノレポ構成、レイヤードなリクエストの流れ、主要な設計判断 |
| [Authentication & Sessions](Authentication-and-Sessions.ja.md) | 利用者・開発者 | 登録/ログイン/ログアウト、セッションの保存・検証方法、強制セッション無効化 |
| [Todo Management](Todo-Management.ja.md) | 利用者・開発者 | Todoの作成/完了/削除、ユーザーごとのデータ分離 |
| [Admin & User Management](Admin-User-Management.ja.md) | 利用者・開発者 | ロール、アカウント状態、「最後の管理者」を守る安全策、アカウント無効化の仕組み |
| [API Reference](API-Reference.ja.md) | 開発者 | 全エンドポイント: メソッド・認証要否・リクエスト/レスポンス形式・ステータスコード |
| [Database Schema](Database-Schema.ja.md) | 開発者 | テーブル定義、関係、SQLレベルで強制される不変条件 |
| [Deployment & Operations](Deployment-and-Operations.ja.md) | 開発者 | Docker Compose(dev/prod)、CI/CDパイプライン、必要なシークレット |

## 更新方針

このプロジェクトの変更頻度は**中〜高**です。あるページが説明している挙動が変わったら(新しいエンドポイント、新しいカラム、ガードの変更など)、**コードの変更と同じPR内で**そのページも更新してください — このWikiを過去の記録として放置しないことが重要です。各ページは元になったソースファイルを明記しているので、それらのファイルを変更したら対応するページも確認してください。

## このWiki全体で使う表記

- エンドポイントは `METHOD /path` の形式で表記します。
- 「ガード」とは、ルートハンドラーの前に実行され、リクエストを打ち切ることもできるFastifyの `preHandler` フックを指します(例: `adminOnlyGuard`)。
- コードパスはリポジトリルートからの相対パスで記載します(`todo-api/...`、`todo-web/...`)。
