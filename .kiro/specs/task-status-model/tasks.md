# Implementation Plan

- [ ] 1. Foundation: ステータスenumのスキーマ定義とデータ移行
- [ ] 1.1 `TodoStatus`enumをPrismaスキーマと型定義に追加する
  - `todo-api/prisma/schema.prisma`に`enum TodoStatus { pending in_progress blocked done }`を追加し、`Todo.status`の型を`Boolean @default(false)`から`TodoStatus @default(pending)`へ変更する
  - `todo-api/src/types/todo.ts`に`TODO_STATUSES`（4値の定数配列）と、そこから導出される`TodoStatus`型を追加し、`Todo.status`の型を`TodoStatus`に変更する
  - 観測可能な完了状態: `prisma generate`実行後、生成された型に`TodoStatus`が含まれ、`pnpm build`が型エラーなく通る（既存のrepository/service呼び出し箇所はこの時点では未修正のため型エラーが出ることは許容し、後続タスクで解消する）
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 1.2 既存Boolean値を新enum値へ安全にバックフィルするマイグレーションを作成する
  - マイグレーション実装前に、対象DBの`todos.status`列に`0`/`1`以外の値を持つ行が存在しないことを確認する（存在する場合はバックフィルを実行せず、先にデータクレンジングが必要であることを報告する）
  - 新しいPrisma migrationとして、(1) `status_new ENUM(...) NOT NULL DEFAULT 'pending'`列を追加 (2) `status = 1`を`done`、それ以外を`pending`にマッピングする`CASE`式でバックフィル (3) 旧`status`列を削除 (4) `status_new`を`status`にリネーム、の4ステップを実装する
  - `orm-migration`のベースラインマイグレーション（`0_init`）には変更を加えない
  - 観測可能な完了状態: 移行前に`status`が0または1混在するテストデータを用意し、`prisma migrate deploy`実行後に`todos.status`列が`ENUM('pending','in_progress','blocked','done')`型になっており、`0`だった行が`pending`、`1`だった行が`done`になっている
  - _Requirements: 2.1, 2.2_
  - _Depends: 1.1_

- [ ] 1.3 移行の非破壊性を検証するテストを追加する
  - 移行前後でTodoの総件数が変化しないこと、各行の`user_id`が変化しないことを検証するテストを追加する
  - 観測可能な完了状態: テスト実行で移行前後の件数・`user_id`一致がアサーションされ、パスする
  - _Requirements: 2.3, 2.4_
  - _Depends: 1.2_

- [ ] 2. Core: バックエンドAPI層でのステータス受け渡し
- [ ] 2.1 (P) `TodoRepository`をenum型のstatusに対応させる
  - `create(title, userId, status)`のデフォルト値を`0`から`"pending"`へ変更し、引数の型を`TodoStatus`にする
  - `update(id, userId, data)`の`data.status`の型を`TodoStatus`に変更する（早期return・部分更新ロジック自体は変更しない）
  - 観測可能な完了状態: `TodoRepository.create(title, userId)`を`status`省略で呼び出すと、生成されたTodoの`status`が`"pending"`になる
  - _Requirements: 1.2, 3.1_
  - _Boundary: TodoRepository_

- [ ] 2.2 (P) `TodoService`にステータス値のバリデーションを追加する
  - `update()`で`data.status`が指定された場合、`TODO_STATUSES`に含まれるかを検証し、含まれない場合は`AppError("invalid status", 400)`を送出する
  - `title`のみの更新等、`status`を含まないリクエストの既存の挙動は変更しない
  - 観測可能な完了状態: `TodoService.update`に`TODO_STATUSES`に含まれない文字列を`status`として渡すと、400の`AppError`がthrowされ、Todoの状態は変化しない
  - _Requirements: 1.3, 3.1, 3.2, 3.4_
  - _Boundary: TodoService_

- [ ] 2.3 (P) Fastifyルートスキーマとコントローラーの型をenumに合わせて更新する
  - `todos.route.ts`の`updateTodoSchema.body.properties.status`を`{ type: "integer", enum: [0, 1] }`から`{ type: "string", enum: [...TODO_STATUSES] }`へ変更する
  - `todos.controller.ts`の`update`ハンドラのBody型`{ title?: string; status?: number }`を`{ title?: string; status?: TodoStatus }`へ変更する
  - 観測可能な完了状態: `PATCH /todos/:id`に`status: "in_progress"`を送るとFastifyスキーマを通過し、`status: "unknown"`のような値を送るとスキーマバリデーションで400が返る
  - _Requirements: 3.1, 3.2, 3.3_
  - _Boundary: TodoController, TodoRoute_

- [ ] 3. Integration: バックエンドのステータス処理に対するテスト整備
- [ ] 3.1 リポジトリ・サービス層のテストをenum値に追従させる
  - `todos.repository.test.ts`・`todos.service.test.ts`の`status`に関するフィクスチャ・アサーションを数値(0/1)からenum文字列値へ更新する
  - 許容4値それぞれでの更新成功ケースと、不正な`status`値でのリジェクトケースをテストに追加する
  - 観測可能な完了状態: 更新後の`todos.repository.test.ts`・`todos.service.test.ts`がenum文字列値の状態で全てパスする
  - _Requirements: 1.2, 1.3, 3.1, 3.2, 3.4_
  - _Depends: 2.1, 2.2_

- [ ] 3.2 ルートレベルのステータス更新テストを追加する
  - `PATCH /todos/:id`に不正な`status`文字列を送信すると400が返ることを確認するテストを追加する
  - 他ユーザーが所有するTodoへの`status`更新が既存どおり404になることを確認するテストを追加する
  - 観測可能な完了状態: 追加したルートレベルテストが400/404それぞれのケースでパスする
  - _Requirements: 3.2, 3.3_
  - _Depends: 2.3_

- [ ] 4. Core: フロントエンドのステータス型とUI
- [ ] 4.1 フロントエンドの`Todo.status`型をバックエンドのenumにミラーする
  - `todo-web/lib/types.ts`の`Todo.status: number`を`Todo.status: TodoStatus`（`"pending" | "in_progress" | "blocked" | "done"`）へ変更する
  - このタスク自体は型定義の変更のみであり、未完了/完了の表示切り分け（4.3, 4.4）を実際に満たすのはこの型に依存するTask 4.2のフィルタ実装である点に注意する
  - 観測可能な完了状態: `todo-web`側の型定義に`TodoStatus`が存在し、`pnpm build`（型チェック）を実行すると、この時点で`status`を数値比較している既存コード箇所に型エラーが出る（後続タスクで解消する前提の中間状態であることを確認する）
  - _Requirements: 4.3, 4.4_

- [ ] 4.2 (P) `TodoApp.tsx`のフィルタ条件と完了/戻す操作をenum値に対応させる
  - `activeTodos`/`doneTodos`のフィルタ条件を`status === 0 / 1`から`status !== "done" / === "done"`へ変更する
  - `handleComplete`が`updateTodo(id, { status: "done" })`を、`handleRestore`が`updateTodo(id, { status: "pending" })`を送信するように変更する
  - 観測可能な完了状態: 未完了Todoで完了操作を行うと「完了済み」セクションに移動し、「戻す」操作で「未完了」セクションに戻って`status`が`pending`になる
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3_
  - _Boundary: TodoApp_
  - _Depends: 4.1_

- [ ] 4.3 (P) `TodoStatusControl`コンポーネントを新規作成する
  - 未完了Todo1件について、現在のステータス（`pending`/`in_progress`/`blocked`）を表示し、利用者が選択を変更した際に`onStatusChange(id, newStatus)`を呼び出すプレゼンテーショナルコンポーネントを`todo-web/components/todo/TodoStatusControl.tsx`に実装する
  - 既存の「完了」「削除」ボタンとは独立したUI要素として設計する（ステータス変更が完了操作を兼ねない）
  - 観測可能な完了状態: `TodoStatusControl`単体をレンダリングし、ステータス選択を変更すると`onStatusChange`が新しいステータス値とともに呼び出される
  - _Requirements: 5.1, 5.2, 5.3_
  - _Boundary: TodoStatusControl_
  - _Depends: 4.1_

- [ ] 5. Integration: ステータス切替UIをTodo一覧へ組み込む
- [ ] 5.1 `TodoStatusControl`を`ActiveTodos.tsx`に統合する
  - `ActiveTodos.tsx`の各Todo行に`TodoStatusControl`を追加し、`onStatusChange`を`TodoApp.tsx`側の更新ハンドラ（`updateTodo(id, { status })`呼び出し→ローカル状態更新）に接続する
  - 観測可能な完了状態: Todo一覧画面で未完了Todoのステータスを`pending`/`in_progress`/`blocked`の間で切り替えると、画面表示とAPIへの送信内容の両方が新しいステータスに更新される
  - _Requirements: 5.1, 5.2, 5.3_
  - _Depends: 4.2, 4.3_

- [ ] 6. Validation: フロントエンドテスト整備と全体回帰確認
- [ ] 6.1 フロントエンドのステータス関連テストを更新・追加する
  - `TodoApp.test.tsx`・`ActiveTodos.test.tsx`・`DoneTodos.test.tsx`の`status`フィクスチャをenum文字列値へ更新する
  - `TodoStatusControl`経由でのステータス切替と、5件制限が`pending`/`in_progress`/`blocked`いずれのTodoも件数対象に含めることを確認するテストを追加する
  - 観測可能な完了状態: 更新後のフロントエンドテストスイートが全てパスする
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3_
  - _Depends: 5.1_

- [ ] 6.2 バックエンド・フロントエンド全体の回帰確認を実施する
  - `todo-api`側でVitestスイート全体（`pnpm test`）と型チェック（`pnpm build`）を実行する
  - `todo-web`側でフロントエンドテストスイートと型チェック（`pnpm build`）を実行する
  - 5件のアクティブTodo制限、未完了/完了の二分表示が、拡張後も既存と同じ挙動になることを確認する
  - 観測可能な完了状態: 両パッケージのテスト・ビルドが全てグリーンになり、5件制限・未完了/完了フィルタの手動確認結果が既存仕様と一致する
  - _Requirements: 6.1, 6.2, 6.3_
  - _Depends: 3.1, 3.2, 6.1_
