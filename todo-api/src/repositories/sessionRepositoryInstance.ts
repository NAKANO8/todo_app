// SessionRepositoryは`app.redis`（Fastifyプラグイン登録後にしか存在しない）に依存するため、
// 他のリポジトリ（`db/client.ts`の`pool`等）のようにモジュール読み込み時点で即座には構築できない。
// `app.ts`の`buildApp()`内で一度だけ初期化し、コントローラ側はこのモジュール経由で参照する。

import { SessionRepository } from "./session.repository";

let instance: SessionRepository | undefined;

export function initSessionRepository(repository: SessionRepository): void {
  instance = repository;
}

export function getSessionRepository(): SessionRepository {
  if (!instance) {
    throw new Error(
      "SessionRepository is not initialized. initSessionRepository() must be called during app startup (buildApp())."
    );
  }
  return instance;
}
