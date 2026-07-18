# Implementation Plan

- [ ] 1. Foundation: スキーマ・暗号化・外部APIクライアント・排他ロックの基盤整備
- [ ] 1.1 Prismaスキーマを拡張し、マイグレーションを作成する
  - `prisma/schema.prisma`に`RedmineConnection`（`userId`への`@unique`制約、`baseUrl`、暗号化済みAPIキーの3カラム、`lastSyncedAt`）と`RedmineStatusMapping`（`connectionId`+`redmineStatusId`の複合ユニーク制約、`todoStatus`は`task-status-model`の`TodoStatus`enumを参照）モデルを追加する
  - `Todo`モデルに`redmineIssueId`（nullable）・`redmineIssueUrl`（nullable）列を追加し、`@@unique([userId, redmineIssueId])`を追加する。既存の`status`・`title`等の列は変更しない
  - 新規マイグレーションを作成し、既存の`todos`テーブルの行数・既存列の値が変化しないことを確認する
  - 観測可能な完了状態: 新規の空DBに対して`prisma migrate deploy`を実行すると、`redmine_connections`/`redmine_status_mappings`テーブルが作成され、`todos`テーブルに`redmine_issue_id`/`redmine_issue_url`列が追加され、既存のシードデータの行数・列値が変化しない
  - _Requirements: 1.4, 2.2, 4.5, 5.1, 5.2, 7.1_

- [ ] 1.2 (P) `CredentialCipher`を実装し、暗号鍵の環境変数を追加する
  - Node.js標準`crypto`モジュールのAES-256-GCMを用いて、平文文字列を暗号文・IV・認証タグの組に暗号化し、その逆に復号する`CredentialCipher`を`todo-api/src/security/credentialCipher.ts`に実装する
  - 暗号鍵を環境変数`REDMINE_ENCRYPTION_KEY`から読み込み、未設定時はアプリケーション起動時にフェイルファストする（既存の`SESSION_SECRET`と同じ運用パターン）
  - `.env.dev.example`/`.env.prod.example`/`.env.test.example`に`REDMINE_ENCRYPTION_KEY`を追加する
  - 観測可能な完了状態: `encrypt(平文)`の戻り値を`decrypt()`に渡すと元の平文と完全に一致し、認証タグを改ざんした場合は例外がthrowされる
  - _Requirements: 1.8, 7.1_
  - _Boundary: CredentialCipher_

- [ ] 1.3 (P) `RedmineClient`を実装する
  - `X-Redmine-API-Key`ヘッダによる認証で、`testConnection`（`GET /users/current.json`）・`listIssueStatuses`（`GET /issue_statuses.json`、`{ id, name, isClosed }`へ正規化）・`listAssignedIssues`（`GET /issues.json?assigned_to_id=me&status_id=*&updated_on=...&limit=...&offset=...`、ページネーション対応）を`todo-api/src/clients/redmineClient.ts`に実装する
  - 認証エラーは`RedmineAuthError`、到達不能・タイムアウトは`RedmineUnavailableError`として区別してthrowし、平文のAPIキーを例外メッセージ・ログに含めない。HTTPリクエストにタイムアウトを設定する
  - `todo-api/src/types/redmine.ts`に`RedmineStatus`/`RedmineIssue`型を定義する
  - 観測可能な完了状態: モックHTTPサーバーに対して、認証エラー時に`RedmineAuthError`、到達不能時に`RedmineUnavailableError`、正常系で`{ id, name, isClosed }`形式のステータス配列が返る
  - _Requirements: 1.8, 3.3_
  - _Boundary: RedmineClient_

- [ ] 1.4 (P) `RedmineSyncLock`を実装する
  - 既存の`app.redis`（`@fastify/redis`）を用いて、`SET redmine:sync:lock:<connectionId> 1 NX PX <ttlMs>`による接続単位の排他ロックを`withLock(connectionId, fn)`として`todo-api/src/services/redmineSyncLock.service.ts`に実装する
  - ロック取得に失敗した場合は`fn`を実行せず`null`を返し、`fn`の実行が例外で終了した場合も確実にロックを解放する
  - 観測可能な完了状態: 同一`connectionId`に対して`withLock`を並行して2回呼び出すと、一方は`fn`を実行して結果を返し、もう一方は`fn`を実行せず`null`を返す
  - _Requirements: 5.3_
  - _Boundary: RedmineSyncLock_

- [ ] 2. Core: データアクセス層
- [ ] 2.1 (P) `RedmineConnectionRepository`を実装する
  - `create`/`update`/`delete`/`findByUserId`/`findAllActive`（全接続の`userId`一覧を返す。スケジューラが利用）を`todo-api/src/repositories/redmineConnection.repository.ts`に実装する
  - 観測可能な完了状態: `create`で1件作成した接続が`findByUserId`で取得でき、`delete`後は`findAllActive`の結果に含まれない
  - _Requirements: 1.4, 1.5, 1.6_
  - _Boundary: RedmineConnectionRepository_
  - _Depends: 1.1_

- [ ] 2.2 (P) `RedmineStatusMappingRepository`を実装する
  - 接続IDに紐づくマッピングの洗い替え（`replaceAll(connectionId, mappings)`）と取得（`findByConnectionId`）を`todo-api/src/repositories/redmineStatusMapping.repository.ts`に実装する
  - 観測可能な完了状態: `replaceAll`を2回異なる内容で呼び出すと、`findByConnectionId`の結果が最後に渡した内容のみを反映する
  - _Requirements: 2.2, 2.4_
  - _Boundary: RedmineStatusMappingRepository_
  - _Depends: 1.1_

- [ ] 2.3 (P) `TodoRepository`にRedmine由来Todo作成用のメソッドを追加する
  - `createFromRedmine(title, userId, status, redmineIssueId, redmineIssueUrl)`と`existsByRedmineIssueId(userId, redmineIssueId)`を`todo-api/src/repositories/todos.repository.ts`に追加する。既存の`findAll`/`findById`/`create`/`update`/`delete`のシグネチャ・挙動は変更しない
  - 観測可能な完了状態: 同一`(userId, redmineIssueId)`で`createFromRedmine`を2回呼び出すと2件目はDBのユニーク制約違反となり、事前に`existsByRedmineIssueId`で確認すれば2件目の呼び出し自体を回避できる
  - _Requirements: 4.1, 4.3, 4.4, 4.6, 5.1, 5.2_
  - _Boundary: TodoRepository_
  - _Depends: 1.1_

- [ ] 3. Core: 業務ロジック層
- [ ] 3.1 `RedmineConnectionService`を実装する
  - `registerConnection`（既存接続があれば409、`RedmineClient.testConnection`失敗時は400で保存しない、成功時は`CredentialCipher.encrypt`した値を保存）・`updateConnection`（接続が存在しなければ404、疎通確認後に更新）・`deleteConnection`（存在しなければ404）・`getConnection`（`baseUrl`と`lastSyncedAt`のみ返し、APIキーは一切返さない）を`todo-api/src/services/redmineConnection.service.ts`に実装する
  - 全メソッドは呼び出し元が渡す`userId`のみにスコープし、他利用者の接続を操作する経路を持たない
  - 観測可能な完了状態: 疎通確認が失敗するAPIキーで`registerConnection`を呼び出すと接続情報が保存されず400相当のエラーがthrowされ、2回目の`registerConnection`呼び出しは409相当のエラーになる
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - _Depends: 1.2, 1.3, 2.1_

- [ ] 3.2 (P) `RedmineStatusMappingService`を実装する
  - `listAvailableStatuses(userId)`（接続情報を復号し`RedmineClient.listIssueStatuses`を呼び出す。接続がなければ404）・`saveMapping(userId, mappings)`（接続がなければ404、`replaceAll`で保存）・`resolveStatus(connectionId, redmineStatus)`（明示的マッピングを優先し、未定義なら`isClosed`に基づく既定ルールで`"done"`/`"pending"`を返す）を`todo-api/src/services/redmineStatusMapping.service.ts`に実装する
  - 観測可能な完了状態: マッピング未定義のクローズ済みステータスに対して`resolveStatus`が`"done"`を返し、未クローズのステータスには`"pending"`を返す。明示的マッピングがあればそちらが優先される
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - _Boundary: RedmineStatusMappingService_
  - _Depends: 1.3, 2.2_

- [ ] 3.3 `RedmineSyncService`を実装する
  - `syncForUser(userId)`が、`RedmineConnectionRepository.findByUserId(userId)`で接続情報を取得できなければ（未登録または削除済みであれば）`AppError(404, "redmine connection not found")`を送出して以降の処理を一切行わない、という前提チェックをまず行う（要件1.6: 接続削除後はポーリング・手動トリガーいずれの経路でもチケット取得を行わない）
  - 接続が存在する場合は、`RedmineSyncLock.withLock`で接続単位のロックを取得した上で、接続情報の復号→`RedmineClient.listAssignedIssues`（`updated_on>=lastSyncedAt`の増分取得）→各チケットについて`existsByRedmineIssueId`で重複確認→未取り込みのもののみ`resolveStatus`でステータス解決→タイトルを`#<チケット番号> <件名>`形式で組み立て、`<baseUrl>/issues/<チケット番号>`を`redmineIssueUrl`として`createFromRedmine`を呼び出す、という一連の処理を`todo-api/src/services/redmineSync.service.ts`に実装する
  - `RedmineClient`が`RedmineAuthError`/`RedmineUnavailableError`をthrowした場合は当該回の処理を中断してエラーを記録し、`lastSyncedAt`を更新しない。全件処理が完了した場合のみ`lastSyncedAt`を現在時刻に更新する
  - ロック取得に失敗した場合は`fn`を実行せず、処理をスキップしたことが呼び出し元にわかる結果を返す
  - 観測可能な完了状態: 未取り込みのチケットのみが新規Todoとして作成され、既に取り込み済みのチケットは再度処理されず、チケット取得が失敗した場合は`lastSyncedAt`が更新されず、接続情報が存在しない`userId`で`syncForUser`を呼び出すと404相当のエラーがthrowされてRedmineへの通信自体が発生しない
  - _Requirements: 1.6, 2.5, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.6, 5.1, 5.2, 5.3, 6.3_
  - _Depends: 1.4, 2.1, 2.3, 3.2_

- [ ] 4. Core: API層
- [ ] 4.1 (P) 接続設定・ステータスマッピングAPIを実装する
  - `RedmineConnectionController`と`todo-api/src/routes/redmine.connection.route.ts`に、`POST /redmine/connection`・`PATCH /redmine/connection`・`DELETE /redmine/connection`・`GET /redmine/connection`・`GET /redmine/connection/statuses`・`PUT /redmine/connection/status-mapping`を実装する
  - 全エンドポイントに既存の`requireAuthGuard`を適用し、ハンドラは常に`req.session.userId`のみを対象`userId`として`RedmineConnectionService`/`RedmineStatusMappingService`へ渡す（リクエストボディ・パラメータから`userId`を受け取る経路を持たない）
  - `GET /redmine/connection`のレスポンスに暗号化済み・復号済みいずれのAPIキーも含めない
  - 観測可能な完了状態: 未認証で`POST /redmine/connection`を呼ぶと401、認証済みで疎通確認に成功する接続情報を登録すると201相当が返り、`GET /redmine/connection`のレスポンスにAPIキーの値が一切含まれない
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.4, 7.2_
  - _Boundary: RedmineConnectionController, redmine.connection.route_
  - _Depends: 3.1, 3.2_

- [ ] 4.2 (P) 手動同期トリガーAPIを実装する
  - `RedmineSyncController`と`todo-api/src/routes/redmine.sync.route.ts`に、`requireAuthGuard`配下の`POST /redmine/sync`を実装し、`req.session.userId`に対して`RedmineSyncService.syncForUser`を呼び出して`{ created, skipped }`を返す
  - `RedmineClient`起因の通信失敗が発生した場合は502相当のレスポンスを、接続情報が未登録・削除済み（`AppError(404)`）の場合は404相当のレスポンスを返す（要件1.6: 接続削除後は手動トリガーからもチケット取得を行わない）
  - 観測可能な完了状態: 認証済み利用者が`POST /redmine/sync`を呼ぶと、その利用者に割り当てられた未取り込みチケットの件数分だけ新規Todoが作成されレスポンスに作成件数が含まれ、接続未登録の利用者が呼び出した場合は404が返りRedmineへの通信が発生しない
  - _Requirements: 1.6, 3.2, 7.2_
  - _Boundary: RedmineSyncController, redmine.sync.route_
  - _Depends: 3.3_

- [ ] 5. Integration: 定期実行基盤とアプリケーション配線
- [ ] 5.1 `RedmineSyncScheduler`を実装する
  - `todo-api/src/jobs/redmineSync.scheduler.ts`に、環境変数`REDMINE_POLL_INTERVAL_MS`（未設定時は妥当な既定値）に基づく`setInterval`を登録し、実行のたびに`RedmineConnectionRepository.findAllActive()`で得た各`userId`に対して`RedmineSyncService.syncForUser`を個別の`try/catch`で呼び出す関数を実装する
  - `.env.dev.example`/`.env.prod.example`/`.env.test.example`に`REDMINE_POLL_INTERVAL_MS`を追加する
  - 観測可能な完了状態: 複数接続のうち1接続の`syncForUser`が例外をthrowしても、他の接続に対する`syncForUser`呼び出しは実行され完了する
  - _Requirements: 3.1, 3.4, 1.6_
  - _Boundary: RedmineSyncScheduler_
  - _Depends: 3.3, 2.1_

- [ ] 5.2 ルート登録とスケジューラ起動を`app.ts`に配線する
  - `app.ts`の`buildApp()`に`redmineConnectionRoutes`・`redmineSyncRoutes`の登録と、起動シーケンスへの`registerRedmineSyncScheduler(app)`呼び出しを追加する
  - 観測可能な完了状態: アプリケーション起動後、`POST /redmine/connection`・`POST /redmine/sync`等の新規エンドポイントが404にならず応答し、起動ログにスケジューラ登録が確認できる
  - _Requirements: 3.1_
  - _Depends: 4.1, 4.2, 5.1_

- [ ] 6. Validation: バックエンドテスト
- [ ] 6.1 (P) `CredentialCipher`と`RedmineClient`の単体テストを追加する
  - 暗号化→復号のラウンドトリップ一致、認証タグ改ざん時の例外、モックHTTPサーバーに対する認証エラー・タイムアウト・正常系レスポンス正規化のテストを追加する
  - 観測可能な完了状態: 追加したテストが全てパスする
  - _Requirements: 1.8, 3.3, 7.1_
  - _Boundary: CredentialCipher, RedmineClient_
  - _Depends: 1.2, 1.3_

- [ ] 6.2 (P) `RedmineConnectionService`と`RedmineStatusMappingService`の単体テストを追加する
  - 疎通確認失敗時に接続情報が保存されないこと、2件目登録が409になること、更新・削除対象がなければ404になること、マッピング未定義時の既定ルール適用と明示的マッピングの優先をテストする
  - 観測可能な完了状態: 追加したテストが全てパスする
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.3, 2.4_
  - _Boundary: RedmineConnectionService, RedmineStatusMappingService_
  - _Depends: 3.1, 3.2_

- [ ] 6.3 (P) `RedmineSyncService`と`RedmineSyncLock`の統合テストを追加する
  - 重複チケットが2件目以降スキップされること、同一接続に対する並行`syncForUser`呼び出しの一方がロックによりスキップされること、チケット取得失敗時に`lastSyncedAt`が更新されないこと、接続情報が存在しない`userId`での`syncForUser`呼び出しが404相当のエラーになりRedmineへの通信が発生しないこと、取り込み後のTodo編集がRedmineへの書き戻しを一切発生させないこと、再同期時に既存Todoのステータスが変更されないことを実DB・モックRedmineに対して確認する
  - 観測可能な完了状態: 追加した統合テストが全てパスする
  - _Requirements: 1.6, 4.6, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3_
  - _Boundary: RedmineSyncService, RedmineSyncLock_
  - _Depends: 3.3_

- [ ] 6.4 (P) APIルートレベルの統合テストを追加する
  - `POST /redmine/connection`の成功/400/409、`PATCH`/`DELETE`の404、`POST /redmine/sync`の成功・接続未登録時の404・Redmine通信失敗時の502、既存の`GET /todos`のレスポンスに新規追加した`redmineIssueId`/`redmineIssueUrl`が含まれることを確認する
  - 観測可能な完了状態: 追加したルートレベルテストが全てパスする
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 3.2, 4.5_
  - _Boundary: redmine.connection.route, redmine.sync.route_
  - _Depends: 4.1, 4.2_

- [ ] 7. Core: フロントエンド
- [ ] 7.1 (P) Todo型とRedmine APIクライアントを追加する
  - `todo-web/lib/types.ts`の`Todo`型に`redmineIssueId`/`redmineIssueUrl`（いずれもnullable）を追加し、`todo-web/lib/api/redmine.ts`に接続設定・ステータスマッピング・手動同期を呼び出すAPIクライアント関数を実装する
  - 観測可能な完了状態: `pnpm build`（型チェック）がエラーなく通り、`lib/api/redmine.ts`の各関数が対応するバックエンドエンドポイントを正しいメソッド・パスで呼び出す
  - _Requirements: 4.5_
  - _Boundary: lib/types.ts, lib/api/redmine.ts_
  - _Depends: 4.1, 4.2_

- [ ] 7.2 (P) 接続設定・ステータスマッピング設定画面を実装する
  - `todo-web/features/redmine/RedmineConnectionForm.tsx`（接続情報の登録・更新・削除、疎通結果のフィードバック表示）・`RedmineStatusMappingForm.tsx`（取得したRedmineステータス一覧に対するマッピング編集）・`todo-web/app/settings/redmine/page.tsx`（両フォームと手動同期ボタンを配置するページ）を実装する
  - 観測可能な完了状態: 設定ページで接続情報を登録すると疎通結果が画面に表示され、ステータス一覧が取得された後にマッピングを編集・保存できる
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 2.1, 2.2, 2.4_
  - _Boundary: features/redmine_
  - _Depends: 7.1_

- [ ] 7.3 (P) Todo一覧にRedmine参照リンクを表示する
  - `todo-web/components/todo/RedmineBadge.tsx`（`redmineIssueUrl`がある場合のみ元チケットへのリンクを表示するプレゼンテーショナルコンポーネント）を実装し、`ActiveTodos.tsx`・`DoneTodos.tsx`の各Todo行に追加する
  - 観測可能な完了状態: `redmineIssueUrl`を持つTodoの行にリンクが表示され、持たないTodoの行には何も表示されない
  - _Requirements: 4.5_
  - _Boundary: components/todo/RedmineBadge, ActiveTodos, DoneTodos_
  - _Depends: 7.1_

- [ ] 8. Validation: フロントエンドテストと結合確認
- [ ] 8.1 フロントエンドのコンポーネントテストを追加する
  - `RedmineConnectionForm`・`RedmineStatusMappingForm`・`RedmineBadge`のレンダリング・操作（登録・更新・削除・マッピング保存・リンク表示/非表示）のテストを追加する
  - 観測可能な完了状態: 追加したコンポーネントテストが全てパスする
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 2.1, 2.2, 2.4, 4.5_
  - _Depends: 7.2, 7.3_

- [ ] 8.2 接続登録から同期・表示までの一連の結合確認を行う
  - モックまたはテスト用Redmineインスタンスに対して、接続登録→疎通確認→ステータスマッピング設定→手動同期トリガー→Todo一覧にRedmine参照リンク付きで表示→当該Todoを編集してもRedmineへ反映されず再同期でも上書きされないこと、という一連のフローを通しで確認する
  - 観測可能な完了状態: 上記フローが手動またはE2Eテストで最初から最後まで成功し、すべての中間状態（疎通結果、マッピング反映、Todo作成、編集の非反映）が観測できる
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.1, 6.2, 6.3_
  - _Depends: 8.1, 6.4_
