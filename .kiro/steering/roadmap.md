# Roadmap

## Overview
グループ/ロール機能、Todoステータスモデルの拡張、担当者の割り当て、期限ベースのタスク腐敗検知、Redmineとの連携を追加するための一連のspecの依存順序を定義する。各specの背景・意図・優先順位の詳細な理由は非公開ドキュメントで管理する。

## Specs (dependency order)
- [ ] orm-migration -- Prisma ORM導入と既存スキーマ・クエリの移行。Dependencies: none
- [ ] team-management -- groups/membershipテーブル追加、`group_leader`ロール追加、グループスコープの認可基盤。Dependencies: orm-migration
- [ ] task-status-model -- Todoステータスを`pending`/`in_progress`/`blocked`/`done`の4値に拡張。Dependencies: orm-migration
- [ ] task-assignment -- Todoへの担当者（`assignee_id`）の割り当て。Dependencies: team-management
- [x] task-rot-detection -- `due_date`フィールド追加、経過時間ベースの腐敗信号計算、可視性分岐と通知/ヘルプ機能。Dependencies: team-management, task-status-model, task-assignment（requirements/design承認済み、実装は依存spec完了後）
- [ ] redmine-integration -- Redmineチケットを起点とした一方向のTodo自動生成・ステータス反映。Dependencies: task-status-model

## Constraints
- 各specの実装着手は、依存先specの実装完了後とする（表内Dependencies参照）
- spec.jsonの`language`は`ja`とする
