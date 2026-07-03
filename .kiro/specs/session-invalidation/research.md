# Research & Design Decisions Template

## Summary
- **Feature**: `session-invalidation`
- **Discovery Scope**: Extension（既存の`@fastify/session`セッション認証を拡張し、外部ストア化と管理者向け強制無効化APIを追加する）
- **Key Findings**:
  - `@fastify/session`の既定`MemoryStore`（`node_modules/@fastify/session/lib/store.js`）は`get/set/destroy`のみを持つダックタイピングな`Store`契約であり、契約さえ満たせば任意の実装に差し替え可能。
  - `connect-redis`は v7以降`express-session`をpeer依存にしたため、`@fastify/session`とは直接互換しない（[fastify/session#224](https://github.com/fastify/session/issues/224)で報告済み）。代替のFastify向けRedisストアパッケージ（`fastify-session-redis-store`、`@mgcrea/fastify-session-redis-store`）はいずれも更新が長期間止まっており（後者は4年、前者も2024年6月が最後でスター数2）採用に値しないと判断。`Store`契約自体が`get/set/destroy`の3メソッドのみと薄いため、自前実装を選択。
  - `req.session.sessionId`は`@fastify/session`のSessionクラスに既に生えているgetter（`lib/session.js:205`）であり、ユーザー単位の逆引き索引を作るのに新しいFastify内部APIは不要。
  - `todo-web/middleware.ts`の`authCache`（`AUTH_CACHE_TTL_MS = 30_000`）は、`todo-api`のセッションストアとは独立した別プロセスのキャッシュであり、無効化の反映を遅らせるもう一つの要因。要件フェーズでのユーザーとの対話で発見。

## Research Log

### `@fastify/session`のStoreコントラクト
- **Context**: セッションストアをRedis化するにあたり、既存コードへの影響範囲を確認する必要があった。
- **Sources Consulted**: `todo-api/node_modules/@fastify/session/lib/store.js`, `lib/session.js`（ローカルコード読解）
- **Findings**: `Store`は`set(sessionId, session, callback)` / `get(sessionId, callback)` / `destroy(sessionId, callback)`のみを要求する。`Session`クラスは`this[sessionStoreKey].destroy(this[sessionIdKey], cb)`のように、常にこの3メソッドだけを呼ぶ。
- **Implications**: ストアの実装を差し替えても、`req.session.userId`や`req.session.destroy()`を使う既存コード（`auth.controller.ts`等）は変更不要。差し替えは`app.ts`の`session`登録オプションに閉じる。

### Redis対応ストアの選定
- **Context**: `store`オプションに渡せるRedis実装を探す。
- **Sources Consulted**: WebSearch「@fastify/session Redis store connect-redis compatible 2026」、[fastify/session#224](https://github.com/fastify/session/issues/224)、[fastify-session-redis-store (GitHub)](https://github.com/ctkc/fastify-session-redis-store)、[fastify-session-redis-store (npm registry)](https://registry.npmjs.org/fastify-session-redis-store)、[@fastify/redis (GitHub)](https://github.com/fastify/fastify-redis)
- **Findings**:
  - `connect-redis`は`express-session`がpeer依存になったため`@fastify/session`とは非互換。
  - `fastify-session-redis-store`（`connect-redis`のフォーク）は`@fastify/session`向けに`Store`契約を実装済みだが、npmレジストリで確認したところ**公開バージョンは3つのみ、最新v7.1.2も2024年6月が最後**（現在から見て約2年更新なし）、GitHubスターも2件と採用実績が乏しい。
  - `@mgcrea/fastify-session-redis-store`は別系統のフォークパッケージ`@mgcrea/fastify-session`向けであり、今回使っている公式`@fastify/session`とは組み合わせ不可。加えてGitHub上の最終更新も4年前で放置されている。
  - `@fastify/session`が要求する`Store`契約は`get(sessionId, cb)` / `set(sessionId, session, cb)` / `destroy(sessionId, cb)`の3メソッドのみ（`lib/store.js`で確認済み）で、実装は各コマンドをRedisのGET/SET/DELに委譲するだけの薄いラッパーで済む。
  - `@fastify/redis`は公式プラグインで、内部的に`ioredis`を使用し接続をFastifyインスタンス全体で共有する。2026年1月時点でも更新が続いており活発にメンテナンスされている。
- **Implications**: 外部のRedisストアアダプタ（`fastify-session-redis-store`等）は採用実績・保守状況の両面で信頼性に欠けるため採用を見送り、`@fastify/redis`（ioredisベース、公式・継続メンテ中）が提供するクライアントを使って、`Store`契約を満たす小さなクラスを自前実装する方針に変更する（詳細はDesign Decisions参照）。

### `todo-web`側キャッシュとの関係
- **Context**: ユーザーとの対話で、「PCで無効化してもスマホ側が最大30秒古いキャッシュを見続ける」ケースが有り得ることが判明した。
- **Sources Consulted**: `todo-web/middleware.ts`（ローカルコード読解）
- **Findings**: `authCache`は`sessionId`ごとに`/auth/me`の結果を30秒キャッシュする、`todo-api`とは別プロセス・別`Map`の仕組み。`todo-api`側のセッションストアをRedis化しても、このキャッシュ層は自動的には無効化されない。
- **Implications**: 無効化の「反映までの遅延」の一部はこのキャッシュのTTLに起因する。ユーザーとの合意により、TTLを短縮する方針を採用（詳細は Design Decisions を参照）。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 自前実装のRedis Store + アプリ側逆引きSet（採用） | `@fastify/redis`のioredisクライアントを使い、`get/set/destroy`のみの`Store`契約を自前実装。`userId → sessionId群`はRedisのSetで別途管理 | 外部Storeパッケージの保守リスクを負わない、実装が小さく完全に理解・制御できる、複数インスタンスで自然に一貫性が取れる | 自前実装分のテストを自分たちで用意する必要がある | 既存のレイヤードアーキテクチャに追加するだけで完結 |
| `fastify-session-redis-store`等の外部Storeアダプタ | サードパーティのRedis Store実装をそのまま使う | 実装の手間が省ける | いずれも採用実績・保守状況に乏しい（2〜4年更新なし、スター数一桁） | 却下（npmレジストリ・GitHubで確認） |
| `connect-redis` | 定番のExpress向けRedisストア | 知名度が高い | `@fastify/session`とは非互換（peer依存の破壊的変更） | 却下（[#224](https://github.com/fastify/session/issues/224)で確認） |
| 全セッションキーをスキャンして`userId`一致を探す | `KEYS sess:*`等でRedis全体を走査し、値をパースして対象を探す | 逆引き索引の維持が不要 | Redis全体をブロッキングスキャンする必要がありスケールしない、本番運用に不向き | 却下 |
| `todo-web`側のpub/sub能動キャッシュ破棄 | 無効化時にRedis pub/sub等で全`todo-web`インスタンスのキャッシュを破棄 | 反映遅延をほぼゼロにできる | 新規の購読・接続管理基盤が必要、障害モードが増える、本specのスコープを超える | 却下（ユーザーと合意の上、TTL短縮を採用） |

## Design Decisions

### Decision: Redisストアの実装方法（自前実装 vs 外部パッケージ採用）
- **Context**: `@fastify/session`の`store`オプションに渡す、Redisバックエンドの実装が必要。
- **Alternatives Considered**:
  1. `connect-redis` — `express-session`のpeer依存により`@fastify/session`とは非互換
  2. `@mgcrea/fastify-session-redis-store` — 別フォークの`@mgcrea/fastify-session`向けであり既存の`@fastify/session`とは組み合わせ不可。GitHub上の最終更新も4年前
  3. `fastify-session-redis-store` — `@fastify/session`向けに`Store`契約を実装したフォーク。当初はこれを採用候補としたが、npmレジストリで裏取りした結果、公開バージョンが3つのみ・最新版も2024年6月が最後・GitHubスター2件と、採用実績・保守状況の両面で信頼性に欠けることが判明
  4. 自前実装 — `@fastify/redis`が提供するioredisクライアントを使い、`get(sessionId, cb)` / `set(sessionId, session, cb)` / `destroy(sessionId, cb)`の3メソッドだけを実装する小さな`Store`クラスを書く
- **Selected Approach**: 4（自前実装）を採用。接続管理自体は公式・継続メンテ中の`@fastify/redis`に任せ、その上のStore実装（Redisの GET/SET/DEL を呼ぶだけの薄いラッパー）は自分たちのコードとして持つ。
- **Rationale**: `Store`契約は3メソッドのみで実装が小さく（20〜30行程度）、外部パッケージに求める複雑さの割に、候補パッケージはいずれも保守状況が悪くサプライチェーンリスクの方が上回ると判断した。自前実装なら中身を完全に把握・制御でき、このspecの核心（セッション無効化）に関わるコードをブラックボックス化しないで済む。一方、Redis接続の共有・ライフサイクル管理はFastifyとの統合が複雑になりがちなため、そこは実績のある公式プラグイン（`@fastify/redis`）に任せる、という線引きにした。
- **Trade-offs**: Redisという新しい実行時依存が増える点は変わらない。自前実装した`Store`クラス分のユニットテストは自分たちで用意する必要がある。
- **Follow-up**: 実装時にローカルRedisに対する結合テストで、`get/set/destroy`の呼び出しが`@fastify/session`側の期待（コールバック契約）通りに動くことを確認する。
- **補足検討**: `connect-redis`を`express-session`必須化前のv6.1.3に固定するという代替案も検証したが、「バージョンを固定し続ける」こと自体が新たな監視対象になり（自動更新で誤ってv7以降に上がると壊れる）、かつv7以降の改善・修正の恩恵も受けられないため、自前実装より明確に優れているとは判断しなかった。ユーザーとの合意により自前実装を継続する。**ただし、自前実装は「なぜ既存パッケージを使わずに自分で書いているか」「何を保証しているか」を、実装時のコードコメント・PR説明で誰が読んでも分かる形で明記することを条件とする。**

### Decision: `userId → sessionId`逆引き索引をアプリ側のRedis Setとして明示的に維持する
- **Context**: Requirement 1は「特定ユーザーの全セッションを無効化する」ことを求めるが、Redisストアパッケージ自体はそのようなクエリ手段を提供しない。
- **Alternatives Considered**:
  1. `KEYS`/`SCAN`で全セッションキーを走査し、値の`userId`でフィルタする
  2. `user-sessions:<userId>`というRedis Setをログイン時に追加(SADD)・自己ログアウト時に削除(SREM)し、管理者無効化時に参照(SMEMBERS)する
- **Selected Approach**: 2を採用。ログイン処理・自己ログアウト処理に、この索引を更新する呼び出しを追加する。
- **Rationale**: `SADD`/`SREM`はO(1)、`SMEMBERS`は該当ユーザーのセッション数分のみで済み、Redis全体を走査しない。
- **Trade-offs**: セッションストア本体とは別に、索引という「もう一つの状態」をアプリコードで同期させる責務が生まれる。
- **Follow-up**: 索引がセッションストアの実体とズレた場合でも安全に倒れるよう（Risks参照）、実装時に「無効化のたびに索引を丸ごとクリアする」動作を確認する。

### Decision: `todo-web`側`authCache`のTTLを短縮する（pub/subによる能動破棄は採用しない）
- **Context**: 管理者による無効化後も、`todo-web`側の`authCache`が古い認証結果を最大30秒返し続ける可能性がある。
- **Alternatives Considered**:
  1. `authCache`のTTLを数秒程度に短縮する
  2. 無効化時にRedis pub/sub等で全`todo-web`インスタンスのキャッシュエントリを能動的に破棄する
- **Selected Approach**: 1を採用。`AUTH_CACHE_TTL_MS`を大幅に短縮し、Requirement 1.2の「短い許容遅延」の範囲内に収める。
- **Rationale**: 学習用途の小規模構成に対して、2はスコープと複雑さが見合わない（新しい購読基盤・複数インスタンスでの配信保証・追加の障害モードが必要になる）。1は既存定数の変更のみで完結する。
- **Trade-offs**: `/auth/me`への問い合わせ回数が増え、`todo-api`側の負荷がわずかに増える。
- **Follow-up**: 実装時に具体的なTTL値（数秒程度）を決定し、負荷への影響を軽く確認する。

## Risks & Mitigations
- 逆引き索引（Setの中身）が実際のセッション実体とズレる可能性（例: 何らかの理由でセッションが索引を経由せず消える） — 無効化処理は「索引にある`sessionId`をdestroyし、成功可否に関わらず索引自体を丸ごと消す」という自己修復的な手順にすることで、ズレが蓄積しないようにする。
- Redisという新しい実行時依存の追加により、運用対象が増える — 既存の`db`サービスと同じヘルスチェック付きDocker Composeパターンに揃え、READMEのセルフホスト手順（バックログで別途管理）に追記する。
- `todo-web`側`authCache`のTTL短縮により`/auth/me`への問い合わせが増える — TTLをゼロにはせず数秒残すことで、負荷増加を抑えつつ遅延許容範囲に収める。

## References
- [fastify/session — Store implementation](https://github.com/fastify/session) — `get/set/destroy`契約の一次情報（ローカル`node_modules`のソースで確認）
- [connect-redis no longer compatible with @fastify/session · Issue #224](https://github.com/fastify/session/issues/224) — 非互換の根拠
- [fastify-session-redis-store (GitHub)](https://github.com/ctkc/fastify-session-redis-store) / [npm registry](https://registry.npmjs.org/fastify-session-redis-store) — 検討したが保守状況(2024年6月が最終更新)を理由に不採用
- [mgcrea/fastify-session-redis-store (GitHub)](https://github.com/mgcrea/fastify-session-redis-store) — 検討したが別フォーク向け・4年更新なしのため不採用
- [@fastify/redis (GitHub)](https://github.com/fastify/fastify-redis) — 採用したRedis接続プラグイン（ioredisベース）。Storeの自前実装はこのクライアントを利用する
- [fastify/fastify-secure-session (GitHub)](https://github.com/fastify/fastify-secure-session) — ステートレスCookieセッション方式。本specが前提とする「サーバー側でのセッション破棄」ができないため、`@fastify/session`（採用中）との比較参考として記録
