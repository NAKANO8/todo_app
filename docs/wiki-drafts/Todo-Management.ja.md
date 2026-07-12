# Todo Management

*[English version here](Todo-Management.md)*

## 利用者向け

ログイン後は`/todos`に着地します:

1. 入力欄にタイトルを入力し、**追加 (Add)** をクリックしてTodoを作成
2. チェックボックスをクリックしてTodoの完了/未完了を切り替え
3. 削除をクリックしてTodoを完全に削除(元に戻せません)

すべてのTodoは必ず1つのアカウントに属します — ユーザー間での共有・共同編集はありません。

## 開発者向け

全てのエンドポイントは `todo-api/src/routes/todos.route.ts` → `todos.controller.ts` → `todos.service.ts` → `todos.repository.ts` という流れです。

### ユーザーごとのデータ分離

すべてのクエリは、後からフィルタするのではなく**リポジトリ層で**`userId`によってスコープされます:

```sql
SELECT * FROM todos WHERE user_id = ? AND id = ?
```

`TodoService.getById`(そしてこれを最初に呼ぶ`update`/`delete`も同様に)は、Todoが存在していても他人のものであれば`403 Forbidden`ではなく`404 Todo not found`を投げます。これは意図的な設計で、あるTodo IDが(自分のものでなくても)存在すること自体を呼び出し元に確認させないためです。

コントローラーで`req.session.userId`が`!`で非nullと断定されているのは、`todoRoutes`に直接登録された`preHandler`フック(共有の`adminOnlyGuard`ではなく、todos専用のインラインガード)が、どのハンドラーよりも先にセッションなしのリクエストを`401`で拒否しているためです。

### バリデーション

ルート([`todos.route.ts`](https://github.com/NAKANO8/todo_app/blob/main/todo-api/src/routes/todos.route.ts))上のJSON Schema:

| ルール | 作成(Create) | 更新(Update) |
|---|---|---|
| `title` | 必須、1〜100文字 | 任意、1〜100文字 |
| `status` | なし | 任意、`0`または`1` |
| 未知のフィールド | 拒否(`additionalProperties: false`) | 拒否 |
| 空のボディ | なし | 拒否 — updateは`minProperties: 1`が必要 |

`status`はMySQL上では`BOOLEAN`カラム(`0`=未完了、`1`=完了)で、APIではただの整数として見えます。「進行中」「アーカイブ済み」のような別の状態はありません。

### なぜ全ての変更操作の前に`getById`を呼ぶのか

`update`と`delete`はどちらもまず`TodoService.getById(id, userId)`を呼びます。これは純粋に、対象が存在しない、または他人のものである場合に(SQLの`UPDATE`/`DELETE`を試みて0行に静かに影響するのではなく)`404`を返すためです。変更操作ごとに1回余分なクエリが発生しますが、エラーの意味を`getById`自体の404の挙動と一貫させています。
