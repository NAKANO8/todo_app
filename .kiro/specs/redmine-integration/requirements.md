# Requirements Document

## Project Description (Input)
開発チームは既にRedmineでチケット管理を行っているが、日々の細かいタスク管理を担うこのTodoアプリとRedmineのチケットが分断されており、Redmineのチケットに対応するTodoを手動で作り直す手間が発生している（GitHub issue #61）。現状、外部システムとの連携機能は一切存在せず、Todoは`title`と`status`のみを持ち、外部チケットへの参照フィールドもない。

本機能は、Redmineのチケットを起点として、対応するTodoを自動的に作成する一方向連携（Redmine→Todo）を追加する。Todo側での手動更新をRedmineへ反映する双方向同期は行わない。ユーザーまたはグループ単位でRedmineの接続情報（APIキー等）を登録できるようにし、定期的なポーリングまたは手動トリガーでRedmineチケットを取得し、未取り込みのチケットに対応するTodoを作成する。RedmineチケットのステータスはTodoのステータス（`task-status-model`が確定する`pending`/`in_progress`/`blocked`/`done`の4値enum）へマッピングして初期反映する。同一チケットから複数のTodoが重複して作成されないようにする。Redmineの認証情報は暗号化して保存する。初期スコープは一方向連携・ポーリング方式に限定し、Webhookによるリアルタイム連携やTodo→Redmineへの書き戻しは将来の拡張として扱う。

## Boundary Context (Optional)
- **In scope**: ユーザー単位でのRedmine接続情報（Redmine URL・APIキー）の登録・更新・削除・疎通確認、Redmineステータスと`task-status-model`の4値enumとのマッピング定義、定期ポーリングおよび手動トリガーによるチケット取得、チケットからのTodo自動作成（作成時点のステータスマッピングを反映）、同一チケットからの重複Todo作成防止
- **Out of scope**: Todo側の変更をRedmineへ書き戻す機能（双方向同期）、Redmine以外の外部トラッカー（Jira等）との連携、Webhookによるリアルタイム連携（初期実装はポーリングのみ）、Git/PR連携、Todo作成後にRedmine側のステータス変更を追跡して既存Todoへ反映し続ける継続的同期（本機能はチケット取り込み時点の1回限りのステータス反映のみを行う）
- **Adjacent expectations**: グループ単位でのRedmine接続情報の共有は、ロードマップ上`redmine-integration`が`task-status-model`にのみ依存し`team-management`（グループ機能）に依存しないため、本specでは対象外とし、ユーザー単位の接続に限定する（グループ単位の共有は`team-management`完了後の将来拡張として扱う）。取り込まれたTodoが`task-rot-detection`の腐敗判定対象に含まれるかどうかは、Redmine由来のTodoを他のTodoと区別しない（既存の`due_date`等のフィールドの扱いは`task-rot-detection`の責務のまま）という前提を置く

## Requirements

### Requirement 1: Redmine接続情報の登録・管理
**Objective:** As a Todoアプリの利用者, I want 自分のRedmineインスタンスへの接続情報（URL・APIキー）を登録・更新・削除できること, so that 自分のRedmineチケットを本アプリに取り込める

#### Acceptance Criteria
1. When 利用者がRedmineのURLとAPIキーを入力して接続情報の登録を要求する, the Redmine連携機能 shall 入力されたURL・APIキーを用いてRedmineへの疎通確認を行う
2. If 疎通確認が失敗する（認証エラー、到達不能なURL等）, then the Redmine連携機能 shall 接続情報を保存せずに登録失敗をエラーとして利用者に通知する
3. If 疎通確認が成功する, then the Redmine連携機能 shall 接続情報を暗号化して保存し、登録を完了する
4. The Redmine連携機能 shall 各利用者につき最大1件のRedmine接続情報を保持する
5. When 利用者が登録済みの接続情報の更新（URL・APIキーの変更）を要求する, the Redmine連携機能 shall 新しい情報での疎通確認を行った上で更新を反映する
6. When 利用者が登録済みの接続情報の削除を要求する, the Redmine連携機能 shall 当該接続情報を削除し、以後そのアカウントに対するチケット取得（ポーリング・手動トリガー）を行わない
7. The Redmine連携機能 shall 利用者本人以外が当該利用者のRedmine接続情報を参照・更新・削除できないようにする
8. The Redmine連携機能 shall 保存済みのAPIキーを、登録・更新画面以外の場所（一覧表示、ログ等）に平文で表示しない

### Requirement 2: Redmineステータスとのマッピング定義
**Objective:** As a Todoアプリの利用者, I want 自分のRedmineインスタンスが使用するステータスと本アプリのTodoステータス（`pending`/`in_progress`/`blocked`/`done`）との対応関係を定義できること, so that 取り込まれたTodoが自分たちの運用に合った初期ステータスを持つ

#### Acceptance Criteria
1. When Redmine接続情報の登録または疎通確認が成功する, the Redmine連携機能 shall 当該Redmineインスタンスが保持するステータス一覧を取得し、利用者がマッピングを定義できる状態にする
2. The Redmine連携機能 shall 取得した各Redmineステータスに対して、`pending`/`in_progress`/`blocked`/`done`のいずれか1つを利用者が割り当てられるようにする
3. If 利用者が特定のRedmineステータスに対するマッピングを明示的に定義していない, then the Redmine連携機能 shall 既定のルール（Redmine側で「完了」を意味するステータスは`done`、それ以外は`pending`）に基づいて初期ステータスを決定する
4. The Redmine連携機能 shall 利用者がマッピング定義をいつでも変更できるようにする
5. While マッピング定義が変更された状態にある, the Redmine連携機能 shall 既に作成済みのTodoのステータスを遡って更新しない（新たに取り込まれるチケットにのみ新しいマッピングを適用する）

### Requirement 3: チケット取得
**Objective:** As a Todoアプリの利用者, I want 登録した接続情報を用いて自分のRedmineチケットを定期的または任意のタイミングで取得できること, so that Redmine側の最新チケットを都度手動で確認しなくてよい

#### Acceptance Criteria
1. While 有効なRedmine接続情報が登録されている, the Redmine連携機能 shall 一定の間隔で自動的に当該利用者に割り当てられたRedmineチケットを取得する
2. When 利用者が手動でのチケット取得を要求する, the Redmine連携機能 shall 即時に当該利用者に割り当てられたRedmineチケットを取得する
3. If チケット取得中にRedmineへの接続が失敗する（認証エラー、到達不能、タイムアウト等）, then the Redmine連携機能 shall 当該回の取得を中断し、エラーを記録した上で次回の取得機会に処理を継続する
4. The Redmine連携機能 shall 1回のチケット取得処理が失敗しても、他の利用者の接続情報に対する取得処理に影響を与えない

### Requirement 4: チケットからのTodo自動作成
**Objective:** As a Todoアプリの利用者, I want 取得したRedmineチケットに対応するTodoが自動的に作成されること, so that Redmineのチケットを手動で転記する手間がなくなる

#### Acceptance Criteria
1. When 取得したRedmineチケットの中に本アプリへ未取り込みのものが存在する, the Redmine連携機能 shall 各未取り込みチケットに対応するTodoを1件ずつ作成する
2. The Redmine連携機能 shall 作成するTodoのタイトルに、対応するRedmineチケットの識別情報（チケット番号または件名）を含める
3. The Redmine連携機能 shall 作成するTodoの初期ステータスを、Requirement 2で定義されたマッピングに基づいて設定する
4. The Redmine連携機能 shall 作成するTodoの所有者を、当該Redmine接続情報を登録した利用者とする
5. The Redmine連携機能 shall 作成されたTodoについて、対応するRedmineチケットへの参照（チケット番号またはリンク）を利用者がTodo一覧上で確認できるようにする
6. When 取得したRedmineチケットに対応するTodoが既に取り込み済みである, the Redmine連携機能 shall 当該チケットについて新たなTodoを作成しない

### Requirement 5: 重複取り込み防止
**Objective:** As a Todoアプリの利用者, I want 同じRedmineチケットから複数のTodoが作られないこと, so that Todo一覧が重複データで煩雑にならない

#### Acceptance Criteria
1. The Redmine連携機能 shall 各Redmineチケットにつき、生成されるTodoが常に1件以下であることを保証する
2. While 同一のチケット取得処理内で同じRedmineチケットが複数回参照される, the Redmine連携機能 shall 当該チケットに対して1件のみTodoを作成する
3. If ポーリングと手動トリガーが同時に実行され同一チケットを処理しようとする, then the Redmine連携機能 shall 当該チケットに対して1件のみTodoが作成される状態を保証する

### Requirement 6: 取り込み後のTodoの扱い
**Objective:** As a Todoアプリの利用者, I want Redmineから取り込まれたTodoを他のTodoと同様に自由に編集できること, so that 取り込み後は普段どおりのタスク管理を続けられる

#### Acceptance Criteria
1. The Redmine連携機能 shall 作成されたTodoのタイトル・ステータスを、利用者が他のTodoと同様に編集できる状態にする
2. When 利用者がRedmine由来のTodoのタイトルまたはステータスを編集する, the Redmine連携機能 shall その変更を対応するRedmineチケットへ反映しない
3. After Todoが作成される, the Redmine連携機能 shall 対応するRedmineチケットのステータスが変更されても、既に作成済みの当該Todoのステータスを自動的に更新しない

## Non-Functional Requirements

### Requirement 7: セキュリティ
**Objective:** As a Todoアプリの運用者, I want Redmineの認証情報が安全に管理されること, so that 認証情報の漏洩によるRedmineへの不正アクセスを防げる

#### Acceptance Criteria
1. The Redmine連携機能 shall 保存するRedmineの認証情報（APIキー等）を暗号化した状態で永続化する
2. The Redmine連携機能 shall 認証情報の登録・更新・削除操作を、認証済みの本人のみが実行できるようにする

## Explicitly Out of Scope
- Todo側の変更をRedmineチケットへ反映する機能（双方向同期）
- Redmine以外の外部トラッカー（Jira等）との連携
- Webhookによるリアルタイム連携（初期実装はポーリング・手動トリガーのみ）
- グループ単位でのRedmine接続情報の共有・登録
- Todo作成後のRedmineステータス変更を継続的に追跡し既存Todoへ反映する機能
