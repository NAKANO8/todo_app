## Summary
- **Feature**: `task-assignment`
- **Discovery Scope**: Extension（既存Todo CRUDへの単一FKカラム追加＋候補解決ロジック）
- **Key Findings**:
  - `team-management`は`users.group_id`という単一カラムでグループ所属を表現し、ジョインテーブルは持たない。「タスクが属するグループ」は`todos`テーブル自身には存在せず、作成者（`todos.user_id`）の現在の`group_id`から都度導出する以外の情報源がない。
  - `team-management`が提供する`GET /groups/me/members`は`group_leader`専用ガード（`groupLeaderOnlyGuard`）付きであり、一般`member`は呼び出せない。担当者候補は「タスク作成者本人を含む全メンバー」が必要なため、本specは`team-management`のルートを再利用せず、`AuthRepository.findById`/`findByGroupId`という既存のリポジトリメソッドを直接呼び出す新規エンドポイントを自ドメイン（`todos`）内に持つ。
  - `task-rot-detection`（承認済み・別ブランチ）は可視性導出式`assignee_id IS NOT NULL OR help_requested_at IS NOT NULL`を確定済みで、`assignee_id`のnull許容・型についてこれ以上の意味づけ（自己アサインかどうかの区別等）を要求していない。本specの契約はこの式にそのまま適合する。

## Research Log

### `team-management`のグループ所属モデルとの整合
- **Context**: 担当者候補を「タスクが属するグループのメンバー」に限定する際、Todo自体がグループを持つのか、作成者経由で導出するのかを確認する必要があった。
- **Sources Consulted**: `.kiro/specs/team-management/design.md`（Boundary Commitments、`AuthRepository`拡張のService Interface、Data Models）
- **Findings**:
  - `User.groupId`は`NOT NULL`外部キーで、全ユーザーが常にちょうど1つのグループ（デフォルトグループ含む）に所属する。
  - `AuthRepository.findByGroupId(groupId): Promise<UserSummary[]>`が既に契約として定義済み（`password_hash`を含まない列選択）。
  - `todos`テーブルに`group_id`列を追加する計画は`team-management`にもどのspecにも存在しない。
- **Implications**: 本specは`todos.group_id`のような新規カラムを追加せず、「タスクの属するグループ」＝「作成者(`todos.user_id`)が現在所属するグループ」として都度解決する。この導出はTodoの読み書き時点のライブな評価であり、スナップショットしない（作成者・担当者のグループ異動後の再検証は明示的にOut of Scopeとした）。

### `team-management`の`GET /groups/me/members`が使えないことの確認
- **Context**: 候補一覧APIを新設するか、既存エンドポイントを再利用できるかを確認した。
- **Sources Consulted**: `team-management/design.md`のComponents（`GroupLeaderOnlyGuard`）、Architecture Pattern & Boundary Map
- **Findings**: `GET /groups/me/members`は`groupLeaderOnlyGuard`（`role === 'group_leader'`必須）で保護されており、一般`member`はアクセスできない。本specの要件（メンバーもgroup_leaderも担当者を設定できる）はこのエンドポイントの認可レベルと一致しない。
- **Implications**: 担当者候補の取得は`todos`ドメインの新規エンドポイントとして提供し、`AuthRepository`のメソッドを直接呼び出す。認可は「認証済みであること」のみとし、ロール制限を課さない。`team-management`のルート・ガードは変更しない（Allowed Dependenciesはリポジトリ層のみ）。

### `task-rot-detection`の可視性契約との整合確認
- **Context**: 未実装・別ブランチの`task-rot-detection`design.mdが`assignee_id`に依存しているため、本specが確定させる型・null許容・「アサイン済み」の判定条件がその前提と一致するか確認した。
- **Sources Consulted**: `git show spec/task-rot-detection:.kiro/specs/task-rot-detection/design.md`（可視性の状態遷移、Data Models）、同`requirements.md`（Requirement 9）
- **Findings**:
  - `task-rot-detection`のData Modelsには独自の`assignee_id`定義は無く、「`task-assignment`が確定させる`assigneeId`カラムと担当者候補解決ロジック」を外部依存として参照するのみ（Out of Boundaryに明記）。
  - 可視性導出式は`assignee_id IS NOT NULL OR help_requested_at IS NOT NULL`。すなわち「アサイン済みか」は`assignee_id`のNULL/非NULLのみで判定され、自己アサインか他者アサインかの区別は要求されない。
  - Requirement 9.1「グループタスクとして担当者がアサインされたタスクが作成される」→即時公開、9.2「個人発案のタスク」→デフォルト非公開、という対比は、本specの「担当者未設定＝個人発案タスク」「担当者設定済み＝アサインされたグループタスク」という単純な二値対応と矛盾しない。
- **Implications**: 本specは`assigneeId: number | null`という契約を確定させればよく、自己アサインを許可しても可視性ルールと衝突しない（自己アサインされたタスクも「担当者がアサインされたタスク」として即時公開される。これは意図した挙動であり、design.mdの回答としても明記する）。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|----------------------|-------|
| 新規`AssigneeService`を追加 | 候補解決・検証・表示用名前解決を独立サービスに切り出す | 関心の分離が明確 | 呼び出し元は`TodosService`のみで、独立させる利用者が存在しない。抽象化が過剰 | Simplification原則により不採用 |
| `TodosService`拡張＋`AuthRepository`直接利用（採用） | `TodosService`に候補解決・検証ロジックを追加し、既存`AuthRepository.findById`/`findByGroupId`を直接呼び出す | 新規レイヤーを増やさない。`team-management`が既に提供する契約をそのまま再利用 | `TodosService`が`AuthRepository`に依存する（クロスドメイン依存）が、`task-rot-detection`design.mdの`HelpService`→`team-management`グループ参照と同型の既存パターン | 採用 |

## Design Decisions

### Decision: 担当者候補の解決方法
- **Context**: 「タスクが属するグループのメンバー」をどう解決するか。Todoに`group_id`を持たせるか、作成者経由で導出するか。
- **Alternatives Considered**:
  1. `todos.group_id`列を新設し、作成時にスナップショットする
  2. 作成者(`todos.user_id`)の現在の`group_id`から都度導出する（スナップショットしない）
- **Selected Approach**: 2を採用。`TodosService`内の`resolveGroupMembers(creatorId)`が`AuthRepository.findById(creatorId)`→`groupId`取得→`AuthRepository.findByGroupId(groupId)`という2段のリポジトリ呼び出しで都度解決する。
- **Rationale**: `team-management`のスキーマに`todos.group_id`は存在せず、新設は`team-management`の設計（Boundary Commitments、Revalidation Triggers）に影響しない範囲で本specだけが必要とするカラムになる。brief.mdは「タスクが属するグループ」を作成者の所属先として説明しており、独立カラムを要求していない。都度導出はスキーマ変更を最小化し、`orm-migration`/`team-management`が確立した「1テーブル1リポジトリ」原則を崩さない。
- **Trade-offs**: 作成者が後からグループを異動すると、既存タスクの「候補集合」は新しいグループのメンバーに変わる（過去にアサインされた担当者が新集合に含まれなくなる可能性がある）。この再検証・自動解除は明示的にOut of Scopeとし、既存の担当者はそのまま保持される。
- **Follow-up**: 実装時、`resolveGroupMembers`の呼び出し回数（一覧表示時のN+1）に注意する（Testing Strategy参照）。

### Decision: 担当者候補一覧APIの認可レベル
- **Context**: `team-management`の`GET /groups/me/members`は`group_leader`専用。本specの候補一覧は全メンバーが必要。
- **Alternatives Considered**:
  1. `team-management`の`groupLeaderOnlyGuard`を緩和する
  2. `todos`ドメインに認可レベルの異なる新規エンドポイントを追加する
- **Selected Approach**: 2を採用。`GET /todos/assignee-candidates`を新設し、認証済みであることのみを要求する（ロール制限なし）。
- **Rationale**: `team-management`のガード・ルートを変更すると、`team-management`のRevalidation Triggersに抵触し、そのspecの再検証が必要になる。既存の`AuthRepository`メソッドは（team-managementのAllowed Dependenciesにより）他ドメインからの直接利用が想定されている（`GroupLeaderService`が同じ`AuthRepository`を使う設計と同型）。
- **Trade-offs**: 同種の「グループメンバー一覧を返す」ロジックが`GroupLeaderService`（leader専用）と`TodosService`（全メンバー向け、候補解決用）の2箇所に存在することになるが、認可レベルが異なるため統合すると却って責務が曖昧になる。
- **Follow-up**: なし。

## Risks & Mitigations
- 作成者のグループ異動後に担当者候補集合が変化し、既存の担当者が新しい候補集合に含まれなくなるケース — 本specでは自動解除・再検証を行わない（Out of Scope）。表示・編集時の一貫性は担保しないが、ブリーフ・要件レビューで明示的に許容された前提。
- 一覧表示（`GET /todos`）で各Todoごとに`resolveGroupMembers`を呼ぶとN+1になり得る — 実装時に同一ユーザーの複数Todoに対して呼び出しを1回にまとめる（同一`userId`のリクエストは常に自分のTodoのみを返すため、リクエスト単位で1回のグループメンバー解決に集約できる）。
- 担当者アカウントが無効化(`disabled`)された場合でも`assignee_id`はクリアされない — 本specはユーザー削除機能自体が存在しないシステム全体の前提に従い、対象外として扱う。

## References
- `.kiro/specs/team-management/design.md` — `users.group_id`モデル、`AuthRepository`拡張、`GroupLeaderOnlyGuard`
- `.kiro/specs/orm-migration/design.md` — Prisma Client規約、`TodoRepository`のcontract形（`affectedRows`ベース）
- `spec/task-rot-detection`ブランチの`.kiro/specs/task-rot-detection/design.md`・`requirements.md`（`git show`で参照） — 可視性導出式と`assignee_id`への依存契約
