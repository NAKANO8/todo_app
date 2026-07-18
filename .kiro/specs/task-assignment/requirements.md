# Requirements Document

## Project Description (Input)
グループでTodoを運用するメンバー・group_leaderは、タスクを特定の担当者に割り当てる手段を持たない。誰が対応すべきかが曖昧なままタスクが放置される原因になり得る。`task-rot-detection`の可視性ルール（アサインされたグループタスクは作成時点から公開／個人発案タスクはデフォルト非公開）も、「アサインされているかどうか」を機械的に判定する情報源を必要とするが、現状その情報が存在しない。

Todoには担当者の概念がなく、作成者以外の誰かに紐づける手段がない。`team-management`が提供するグループ・メンバーシップの情報も、まだ担当者候補の集合として消費できる形になっていない。

Todoに担当者（1タスクにつき1人）を設定できるようにする。担当者候補は、そのタスクが属するグループ（作成者が所属するグループ）のメンバーに限定される。自分自身を担当者に設定すること（自己アサイン）も許可する。この担当者情報（`assignee_id`、nullable、`users`への参照）は、`task-rot-detection`が「アサインされたグループタスク」と「個人発案タスク」を区別するための判定材料としてそのまま利用される。

## Introduction
グループでTodoを運用するメンバー・group_leaderは、タスクの担当者を明示的に割り当てる手段を持たない。本機能は、Todoに1人の担当者を設定できるようにし、担当者候補をそのタスクの作成者が現在所属するグループのメンバーに限定する。設定された担当者情報は、`task-rot-detection`が「アサインされたグループタスク」と「個人発案タスク」を区別するための判定材料として利用される。

## Boundary Context (Optional)
- **In scope**: タスクへの担当者（1人）の設定・変更・解除、担当者候補をタスク作成者が現在所属するグループのメンバーに限定するバリデーション、自己アサインの許可、担当者候補一覧の提示、タスク一覧・詳細表示への担当者情報の反映、不正な担当者指定に対するエラー処理
- **Out of scope**: 1タスクへの複数担当者の割り当て、担当者の変更履歴・監査ログの記録、担当者へのアサイン通知、承認を要するアサイン変更ワークフロー、担当者設定後にタスク作成者・担当者のグループ所属が変化した場合の再検証・自動解除、タスクの作成者以外（group_leaderを含む）による他者作成タスクへの担当者設定
- **Adjacent expectations**: 本機能は`team-management`が提供する「全ユーザーは常にちょうど1つのグループに所属する」という前提とグループメンバー一覧の情報を利用する。本機能が保持する担当者情報（設定の有無）は、`task-rot-detection`の可視性判定（担当者が設定されたグループタスクは作成時点から公開）の入力としてそのまま利用されることを前提とし、担当者が未設定であることを明確に判定できる状態を維持する。`task-rot-detection`が提供するグループ共有タスクボード上での担当者表示自体は本機能のスコープ外である。本機能はTodoの担当者設定・変更を既存の`create`/`update`操作の拡張として提供するため、`task-status-model`が確立する`status`のenum型（`pending`/`in_progress`/`blocked`/`done`）にもそのまま従う。

## Requirements

### Requirement 1: 担当者の設定・変更・解除
**Objective:** As a グループでTodoを運用するメンバー, I want 自分のタスクに担当者を設定・変更・解除したい, so that 誰が対応すべきかを明確にできる

#### Acceptance Criteria
1. When ユーザーがグループに属するタスクの作成時に担当者を指定する, the Task Assignment機能 shall そのタスクの担当者として指定されたユーザーを設定する。
2. When ユーザーが自身の作成した既存タスクの編集時に担当者を指定する, the Task Assignment機能 shall そのタスクの担当者を指定されたユーザーに更新する。
3. The Task Assignment機能 shall タスクに担当者を設定しないままの作成・編集を許可する。
4. When ユーザーが既に担当者が設定されている自身のタスクについて担当者指定の解除を行う, the Task Assignment機能 shall そのタスクを担当者未設定の状態に更新する。
5. The Task Assignment機能 shall 1つのタスクにつき同時に1人の担当者のみを保持する。

### Requirement 2: 担当者候補のグループ限定
**Objective:** As a グループでTodoを運用するメンバー, I want 担当者候補がタスクの属するグループのメンバーに限定されてほしい, so that グループ外の人物を誤って割り当てずに済む

#### Acceptance Criteria
1. The Task Assignment機能 shall 担当者候補を、タスク作成者が現在所属するグループのメンバーに限定する。
2. When ユーザーがタスクの担当者候補を確認する, the Task Assignment機能 shall タスク作成者が現在所属するグループのメンバー一覧を候補として提示する。
3. If ユーザーがタスク作成者の所属グループに属さない人物を担当者として指定する, then the Task Assignment機能 shall その担当者指定を拒否する。

### Requirement 3: 自己アサインの許可
**Objective:** As a グループでTodoを運用するメンバー, I want 自分自身を担当者に設定したい, so that 自分が対応するタスクであることを明示できる

#### Acceptance Criteria
1. The Task Assignment機能 shall ユーザーが自分自身を担当者として設定することを許可する。
2. The Task Assignment機能 shall 担当者候補の一覧に、タスク作成者自身を含める。

### Requirement 4: 単独グループにおける担当者候補
**Objective:** As a グループでTodoを運用するメンバー, I want 自分以外にグループメンバーがいない場合でも担当者設定を利用したい, so that グループ規模に関わらず一貫した操作ができる

#### Acceptance Criteria
1. While タスク作成者が所属するグループに作成者本人以外のメンバーが存在しない, the Task Assignment機能 shall 担当者候補として作成者自身のみを提示する。

### Requirement 5: タスク一覧・詳細への担当者表示
**Objective:** As a グループでTodoを運用するメンバー, I want タスク一覧・詳細で担当者を確認したい, so that 誰が対応しているかを一目で把握できる

#### Acceptance Criteria
1. While タスクに担当者が設定されている, the Task Assignment機能 shall タスク一覧・詳細の表示にその担当者を示す情報を含める。
2. While タスクに担当者が設定されていない, the Task Assignment機能 shall タスク一覧・詳細の表示に担当者が未設定である旨を示す。

### Requirement 6: 不正な担当者指定のエラー処理
**Objective:** As a グループでTodoを運用するメンバー, I want 不正な担当者指定が明確に拒否されてほしい, so that 誤った状態でタスクが保存されない

#### Acceptance Criteria
1. If 存在しないユーザーを担当者として指定する, then the Task Assignment機能 shall エラーを返し、担当者の設定を行わない。
2. If タスク作成者の所属グループに属さないユーザーを担当者として指定する, then the Task Assignment機能 shall エラーを返し、担当者の設定を行わない。
3. If 存在しないタスクに対して担当者の設定・解除を試みる, then the Task Assignment機能 shall エラーを返す。

### Requirement 7: 担当者設定操作の権限
**Objective:** As a グループでTodoを運用するメンバー, I want 自分が作成したタスクの担当者のみを自分で管理したい, so that 他者のタスクが意図せず変更されない

#### Acceptance Criteria
1. The Task Assignment機能 shall タスクの担当者の設定・変更・解除を、そのタスクの作成者本人にのみ許可する。
2. If タスクの作成者以外のユーザーがそのタスクの担当者設定・変更・解除を試みる, then the Task Assignment機能 shall その操作を拒否する。
