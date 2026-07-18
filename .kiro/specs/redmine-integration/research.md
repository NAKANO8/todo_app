# Research & Design Decisions Template

---
**Purpose**: Capture discovery findings, architectural investigations、and rationale that inform the technical design.
---

## Summary
- **Feature**: `redmine-integration`
- **Discovery Scope**: Complex Integration（外部システムであるRedmine REST APIとの連携を含む）
- **Key Findings**:
  - Redmine REST APIは`X-Redmine-API-Key`ヘッダ（Redmine 1.1.0以降）によるAPIキー認証を提供し、認証情報の疎通確認は副作用のない`GET /users/current.json`で行える
  - チケット一覧は`GET /issues.json`（`assigned_to_id`, `status_id`, `updated_on`, `limit`/`offset`によるフィルタ・ページネーション）で取得でき、`status`フィールドは`{ id, name, is_closed }`という形で返る
  - Redmineのステータス名・IDはインスタゴごとにカスタマイズ可能であるため、固定の名称マッチングでのマッピングは行わず、利用者が明示的に定義する設定 + `is_closed`に基づく既定ルールの二段構えとする
  - `todo-api`には現時点でスケジューラ・暗号化のいずれの基盤も存在しない。既存のRedis接続（`@fastify/redis`、セッションストアで使用中）を排他制御に転用でき、新規インフラを追加せずに済む

## Research Log

### Redmine REST API 認証方式
- **Context**: brief.mdで「APIキー等」とされていた認証方式の具体的な形を確定する必要があった
- **Sources Consulted**: [Redmine Wiki: Rest api](https://www.redmine.org/projects/redmine/wiki/rest_api)
- **Findings**:
  - 認証方式は3通り: (1) 通常のログインID/パスワードによるHTTP Basic認証、(2) `key`クエリパラメータにAPIキーを付与、(3) `X-Redmine-API-Key`HTTPヘッダにAPIキーを付与（Redmine 1.1.0で追加）。ヘッダ方式はBasic認証の枠組みでAPIキーをユーザー名として渡す形でも動作する
  - レスポンス形式はJSON/XML双方に対応。本統合はJSONのみを使用する
  - ページネーションは`limit`（既定25、最大100）/`offset`、レスポンスエンベロープに`total_count`/`limit`/`offset`が含まれる
- **Implications**: 認証情報は「Redmine base URL」+「APIキー」の2値のみで足りる（ユーザー名/パスワードの保存は不要）。ヘッダ方式（`X-Redmine-API-Key`）を採用し、Basic認証は使用しない（1系統に絞ることで実装・レビューを単純化する）

### Redmine REST API チケット一覧・ステータス形状
- **Context**: Redmine側のチケット取得エンドポイントとステータスのデータ形状を確定し、`task-status-model`が固定した4値enumへのマッピング設計の入力とする
- **Sources Consulted**: [Redmine Wiki: Rest Issues](https://www.redmine.org/projects/redmine/wiki/rest_issues)
- **Findings**:
  - `GET /issues.json`は既定で未クローズの課題のみを返す。`status_id=*`を指定すると開いている/閉じているの両方を返す
  - フィルタ: `assigned_to_id`（`me`で認証ユーザー自身に割り当てられた課題を指定可能）、`project_id`、`updated_on`（`>=`等の演算子はURLエンコードした比較演算子を付与する形式）
  - 単一課題オブジェクトは`id`, `project`, `tracker`, `status: { id, name, is_closed }`, `subject`, `description`, `due_date`, `assigned_to`, `created_on`, `updated_on`等を含む
  - ステータス一覧は別エンドポイント`GET /issue_statuses.json`で取得可能（`id`, `name`, `is_closed`の配列）。マッピング設定UIの選択肢として利用する
- **Implications**: チケット取得は`assigned_to_id=me&status_id=*`を固定条件とし、`updated_on>=<前回同期時刻>`を追加条件として増分取得を行う。ステータスマッピングの選択肢は`GET /issue_statuses.json`から動的に取得し、Redmineインスタンスごとのカスタムステータスに対応する

### 認証情報の暗号化方式
- **Context**: brief.mdの制約「RedmineのAPIキー等の認証情報は暗号化して保存すること」を満たす実装方式を検討した。現状`todo-api`に暗号化ライブラリ・パターンは存在しない
- **Sources Consulted**: Node.js公式`node:crypto`モジュールドキュメント（既存知識で確認。追加の外部ライブラリ調査は不要と判断）
- **Findings**: Node.js標準の`crypto`モジュールはAES-256-GCMによる認証付き暗号化を標準サポートしており、追加npm依存を要しない
- **Implications**: 新規の暗号化ライブラリを追加せず、`node:crypto`のAES-256-GCMを使用する。暗号鍵はアプリケーション単位の環境変数（既存の`SESSION_SECRET`と同じ運用パターン）として管理し、DBには暗号文・初期化ベクトル・認証タグのみを保存する（詳細はDesign Decisions参照）

### ポーリング基盤の実装方式
- **Context**: 「定期的なポーリング」を実現する基盤が`todo-api`に存在しないため、新規導入するか既存の仕組みで代替するかを検討した
- **Findings**: `node-cron`等の外部スケジューラライブラリを追加する案と、Fastifyプラグイン内で`setInterval`を用いる案を比較した。本機能が要求する「一定間隔での自動実行」は、cron式による複雑なスケジュール表現を必要としない単純な定期実行であるため、外部ライブラリの導入は過剰である
- **Implications**: 新規依存を追加せず、Fastifyプラグイン内で`setInterval`ベースの単純なポーリングループを実装する（Design Decisions参照）

### 同時実行時の重複防止
- **Context**: 要件5.3（ポーリングと手動トリガーが同時に同一チケットを処理しようとした場合の重複防止）を満たす排他制御手段を検討した
- **Findings**: `todo-api`は既に`@fastify/redis`経由でRedis接続を保持している（セッションストアで使用中）。Redisの`SET key value NX PX <ms>`はアプリケーションレベルの軽量な排他ロックとして広く使われる標準パターンであり、新規インフラの追加なしに利用できる
- **Implications**: 接続ごとの同期処理を、Redis上の短命ロックキー（`redmine:sync:lock:<connectionId>`）で排他制御する。これにより新規のジョブキュー基盤（BullMQ等）を導入せずに要件5.3を満たす

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 既存レイヤードアーキテクチャの拡張（採用） | `routes → controllers → services → repositories → DB`の既存パターンに、外部API用の`RedmineClient`アダプタ層を追加 | 既存パターンとの一貫性、レビュー・実装の予測可能性が高い | 外部API呼び出しの失敗モードをサービス層に正しく伝播させる設計が必要 | `orm-migration`/`task-status-model`/`team-management`と同じ選択 |
| ジョブキュー基盤（BullMQ等）の導入 | Redis上にジョブキューを構築し、ポーリング・手動トリガーをジョブとして投入 | スケールアウト時の重複実行防止が容易、リトライ機構が標準化される | 新規の重量級依存の追加、現状の単一インスタンス運用には過剰 | 却下。Design SynthesisのSimplificationにより現状のリクエスト量・運用規模ではオーバーエンジニアリングと判断 |
| Webhook受信によるイベント駆動連携 | Redmine側のWebhookプラグインからのプッシュ通知でTodoを作成 | ポーリング間隔の遅延がない | brief.mdで明示的に初期スコープ外と決定済み。Redmine本体にWebhook機能がなくプラグイン依存となり可搬性が低い | 却下（brief.md Scope: Out） |

## Design Decisions

### Decision: 認証情報の暗号化方式
- **Context**: RedmineのAPIキーを暗号化して永続化する必要がある（brief.md制約、要件7.1）
- **Alternatives Considered**:
  1. アプリケーション層でのAES-256-GCM暗号化（`node:crypto`、鍵は環境変数）
  2. DB層の透過的暗号化（MySQLのカラム暗号化機能）
  3. 外部のシークレット管理サービス（Vault等）の導入
- **Selected Approach**: アプリケーション層でAES-256-GCMによる暗号化を行う`CredentialCipher`コンポーネントを新設し、暗号鍵は環境変数`REDMINE_ENCRYPTION_KEY`（32byte/256bit相当をhex文字列で保持）から読み込む。暗号文・初期化ベクトル（IV）・認証タグをそれぞれ独立したカラムに保存する
- **Rationale**: 既存の`SESSION_SECRET`と同じ「環境変数に秘密情報を置く」運用パターンに従うことで学習コストと運用差分を最小化できる。外部シークレット管理サービスは現在の運用規模（Docker Compose単一環境）に対して過剰
- **Trade-offs**: 環境変数の管理者権限を持つ者は理論上暗号鍵にアクセスできる（既存の`SESSION_SECRET`と同水準のリスクであり、新たな脅威モデルの追加ではない）。鍵のローテーションは本specの範囲外とし、将来の運用課題として`Open Questions`に記載する
- **Follow-up**: 実装時に`REDMINE_ENCRYPTION_KEY`未設定時のフェイルファスト動作（起動失敗）を`SESSION_SECRET`と同様に徹底する

### Decision: ポーリング実行方式
- **Context**: 一定間隔でのRedmineチケット取得を実現する必要がある（要件3.1）
- **Alternatives Considered**:
  1. `node-cron`等の外部スケジューラライブラリ
  2. Fastifyプラグイン内の`setInterval`による単純な定期実行
  3. OS/インフラ層のcron（別コンテナ）
- **Selected Approach**: `RedmineSyncScheduler`という新規Fastifyプラグインが、アプリ起動時に`setInterval`を1つ登録し、一定間隔ごとに全ての有効な接続に対して`RedmineSyncService.syncForUser`を順次呼び出す
- **Rationale**: 現在の要件は複雑なスケジュール表現（曜日・時刻指定等）を要求しておらず、単純な固定間隔の定期実行で十分。新規依存・新規コンテナを追加しないことで運用面のシンプルさを保つ
- **Trade-offs**: 将来的にAPIインスタンスを水平スケールする場合、全インスタンスが同時にポーリングを開始し重複実行が発生し得る（現状は単一インスタンス運用のため許容）。この場合はRedisロック（下記）が重複作成そのものは防ぐため、データ不整合には至らない
- **Follow-up**: 将来の水平スケール時は、ポーリング自体をどのインスタンスが起動するかの調整（リーダー選出等）を別途検討する（`Open Questions`参照）

### Decision: 同時実行時の排他制御
- **Context**: ポーリングと手動トリガーが同時に同一接続のチケットを処理しようとした場合の重複防止（要件5.3）
- **Alternatives Considered**:
  1. Redisの`SET NX PX`による短命ロック
  2. DBレベルのユニーク制約のみに依存（ロックなし）
  3. ジョブキュー導入による直列化
- **Selected Approach**: 接続ID単位のRedisロック（`redmine:sync:lock:<connectionId>`、TTL付き）で同期処理全体を排他し、加えてTodo側にも`(user_id, redmine_issue_id)`のユニーク制約を設ける二重の安全策とする
- **Rationale**: ロックは「同時に2つの同期処理が同じチケットに対して重複してAPI呼び出し・Todo作成を試みる」という無駄を防ぎ、ユニーク制約は仮にロックをすり抜けても最終的なデータ不整合を防ぐ最後の砦として機能する（`team-management`のグループ削除保護と同じ「アプリケーション層チェック + DB制約」の二段構えパターンを踏襲）
- **Trade-offs**: ロック取得に失敗した場合はその回の同期をスキップする（要件3.3のエラー処理と同様、次回機会に委ねる）
- **Follow-up**: ロックのTTLは同期処理の想定最大実行時間より十分長く設定する（実装タスクで具体値を決定）

## Risks & Mitigations
- Redmineインスタンスが大量の割り当てチケットを持つ場合、1回の同期処理が長時間化する — `updated_on`による増分取得と、1回の同期で取得する上限件数（実装時に確定、例: 500件）を設けることで緩和する
- Redmineインスタンスがネットワーク的に到達不能な時間が続く場合、`lastSyncedAt`が更新されないため次回以降も同じ範囲を再取得し続ける — 意図した挙動（データロスを避けるフェイルセーフ）として許容する
- 暗号鍵（`REDMINE_ENCRYPTION_KEY`）のローテーション手順が未定義 — 初期リリースでは対象外とし、将来の運用ドキュメントで手順化する
- Redmine側のカスタムステータス追加時、マッピング未定義のまま新チケットが取り込まれる — 要件2.3の既定ルール（`is_closed`ベース）でフォールバックするため、機能停止には至らない

## References
- [Redmine Wiki: Rest api](https://www.redmine.org/projects/redmine/wiki/rest_api) — 認証方式・レスポンス形式・ページネーション
- [Redmine Wiki: Rest Issues](https://www.redmine.org/projects/redmine/wiki/rest_issues) — `/issues.json`のフィルタ・課題オブジェクトの形状
