import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import rateLimit from "@fastify/rate-limit";
import bcrypt from "bcrypt";
import RedisMock from "ioredis-mock";
import { RedisSessionStore } from "../../session/redisSessionStore";
import { SessionRepository } from "../../repositories/session.repository";
import { initSessionRepository } from "../../repositories/sessionRepositoryInstance";

// タスク5.4: PATCH /profile/password のレート制限(Requirement 8.1)専用の検証。
//
// profile.password.api.test.ts (タスク3.2) に既に「11回目で429になる」テストが
// 存在するが、そのテストは最後の1回のステータスしか見ておらず、以下は未検証だった:
//   (a) 1〜10回目が429で"ない"こと(閾値がちょうど10であることのピン留め。
//       設定が厳しすぎても緩すぎてもこのテストは見逃す)
//   (b) レート制限が認証判定(requireAuthGuard)より先に効くこと。@fastify/rate-limit
//       はデフォルトで`onRequest`フックとして動作し、profile.route.tsの
//       requireAuthGuardは`preHandler`として登録されている(Fastifyのライフサイクルは
//       onRequest → preValidation → preHandler の順)。したがって未認証の要求者に
//       対しても閾値超過分は429として拒否されるべきであり、「認証さえされなければ
//       無制限に試行できる」抜け道がないことを確認する
//   (c) /profile/password専用のレート制限バケットが/profile/nameへ漏れ出さないこと
//       (ルート単位でスコープされていること)
//   (d) レート制限がIP単位(既存のkeyGenerator: (req) => req.ip、app.ts参照)で
//       あり、要求者全体で共有されるグローバルな制限ではないこと。もしグローバル
//       だった場合、単一の攻撃者が無関係な全ユーザーのパスワード変更を
//       一時的に妨害できてしまう
//   (e) one-step-further: ブロックが「一時的」であること。ウィンドウ経過後は
//       再び要求が処理されることを確認する。@fastify/rate-limitの既定ストア
//       (LocalStore)はDate.now()を直接比較するだけで独自のタイマーを持たないため、
//       vi.useFakeTimersでDateだけを差し替えれば実際に15分待たずに検証できる
//
// Requirement 8.1 を検証する。

vi.mock("../../repositories/auth.repository", () => ({
  AuthRepository: {
    findPasswordHashById: vi.fn(),
    updatePasswordHash: vi.fn(),
    updateName: vi.fn(),
  },
}));

import { AuthRepository } from "../../repositories/auth.repository";
import { profileRoutes } from "../profile.route";

const CURRENT_PASSWORD = "CorrectPassword1";
// コストを下げて(4)テストの実行時間を抑える(profile.password.api.test.tsと同方針)。
const CURRENT_PASSWORD_HASH = bcrypt.hashSync(CURRENT_PASSWORD, 4);
const NEW_PASSWORD = "NewPassword1";
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

async function buildTestApp() {
  const redisClient = new RedisMock();
  const store = new RedisSessionStore(redisClient as any, "sess:");
  const repository = new SessionRepository(redisClient as any, store);
  initSessionRepository(repository);

  const app = Fastify();
  await app.register(cookie);
  await app.register(session, {
    secret: "test_session_secret_that_is_32chars!",
    store,
    cookie: { secure: false },
  });
  // /profile/password には専用のレート制限(config.rateLimit)が設定されているため、
  // それを実際に有効化するためプラグイン自体を登録する(profile.password.api.test.ts
  // と同方針)。keyGeneratorは明示指定せず既定(IPベース)のままにする。これは
  // app.ts本番設定の`keyGenerator: (req) => req.ip`と同じ挙動になる
  // (@fastify/rate-limitの既定keyGeneratorもreq.ipベースのため)。
  await app.register(rateLimit, { global: false });

  // テスト専用のログイン代替ルート: 指定したuserIdでセッションを張るだけ
  app.get<{ Querystring: { userId: string } }>("/test/login", async (req, reply) => {
    req.session.userId = Number(req.query.userId);
    await req.session.save();
    await repository.trackSession(Number(req.query.userId), req.session.sessionId);
    reply.send({ ok: true });
  });

  await app.register(profileRoutes);
  return { app };
}

function cookieHeader(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function loginAs(app: FastifyInstance, userId: number): Promise<string> {
  const res = await app.inject({ method: "GET", url: `/test/login?userId=${userId}` });
  return cookieHeader(res);
}

// 指定回数だけ /profile/password を叩き、各回のステータスコードを配列で返す。
// currentPasswordはわざと不一致にし、成功パス(セッション無効化)の副作用を避けつつ
// レート制限のカウントだけを消費する(profile.password.api.test.tsと同方針)。
async function hammerPasswordEndpoint(
  app: FastifyInstance,
  times: number,
  opts: { cookie?: string; remoteAddress?: string } = {}
): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < times; i++) {
    const res = await app.inject({
      method: "PATCH",
      url: "/profile/password",
      headers: opts.cookie ? { cookie: opts.cookie } : {},
      remoteAddress: opts.remoteAddress,
      payload: { currentPassword: "WrongPassword1", newPassword: NEW_PASSWORD },
    });
    statuses.push(res.statusCode);
  }
  return statuses;
}

describe("profile.route PATCH /profile/password のレート制限 (タスク5.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (AuthRepository.findPasswordHashById as any).mockImplementation(
      async (userId: number) => (userId === 999 ? null : CURRENT_PASSWORD_HASH)
    );
    (AuthRepository.updatePasswordHash as any).mockResolvedValue(1);
    (AuthRepository.updateName as any).mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Requirement 8.1: 閾値がちょうど10であることをピン留めする。1〜10回目は
  // 通常どおり処理され(現在パスワード不一致による401)、429にはならない。
  // 11回目で初めて429になる。
  it(
    "認証済みの要求者からの試行は10回目まで401で処理され、11回目で初めて429になる",
    async () => {
      const { app } = await buildTestApp();
      const authedCookie = await loginAs(app, 1);

      const statuses = await hammerPasswordEndpoint(app, RATE_LIMIT_MAX + 1, {
        cookie: authedCookie,
      });

      expect(statuses.slice(0, RATE_LIMIT_MAX)).toEqual(
        new Array(RATE_LIMIT_MAX).fill(401)
      );
      expect(statuses[RATE_LIMIT_MAX]).toBe(429);
      await app.close();
    },
    15000
  );

  // Requirement 8.1 / Requirement 9.1・9.2との関係: レート制限は認証判定より
  // 先に効く(@fastify/rate-limitはonRequestフック、requireAuthGuardはpreHandler)。
  // 未認証の要求者であっても10回目までは401(認証エラー)で処理され、
  // 11回目でレート制限自体により429になる。認証さえされなければ無制限に
  // current passwordを試行できてしまう抜け道がないことを確認する。
  it(
    "未認証の要求者からの試行も10回目まで401で処理され、11回目でレート制限により429になる",
    async () => {
      const { app } = await buildTestApp();

      const statuses = await hammerPasswordEndpoint(app, RATE_LIMIT_MAX + 1);

      expect(statuses.slice(0, RATE_LIMIT_MAX)).toEqual(
        new Array(RATE_LIMIT_MAX).fill(401)
      );
      expect(statuses[RATE_LIMIT_MAX]).toBe(429);
      expect(AuthRepository.findPasswordHashById).not.toHaveBeenCalled();
      await app.close();
    },
    15000
  );

  // Requirement 8.1: /profile/password専用のレート制限バケットは/profile/nameへ
  // 漏れ出さない(profile.route.tsで/profile/nameにはconfig.rateLimitが設定されて
  // いない)。同じ要求者・同じIPで/profile/passwordの制限を使い切った直後でも、
  // /profile/nameへの正当な要求は429にならず処理される。
  it(
    "/profile/passwordのレート制限を使い切っても、/profile/nameは429にならず処理される",
    async () => {
      const { app } = await buildTestApp();
      const authedCookie = await loginAs(app, 1);

      const statuses = await hammerPasswordEndpoint(app, RATE_LIMIT_MAX + 1, {
        cookie: authedCookie,
      });
      expect(statuses[RATE_LIMIT_MAX]).toBe(429);

      const nameRes = await app.inject({
        method: "PATCH",
        url: "/profile/name",
        headers: { cookie: authedCookie },
        payload: { name: "New Name" },
      });
      expect(nameRes.statusCode).toBe(200);
      await app.close();
    },
    15000
  );

  // Requirement 8.1: レート制限はIP単位(app.tsのkeyGenerator: (req) => req.ipと
  // 同じ既定挙動)でスコープされ、要求者全体で共有されるグローバルな制限ではない。
  // もしグローバルだった場合、単一の攻撃者(IP A)が無関係な別の要求者(IP B)の
  // パスワード変更操作まで一時的に妨害できてしまう。
  it(
    "あるIPからの試行でレート制限を使い切っても、別のIPからの試行には影響しない",
    async () => {
      const { app } = await buildTestApp();
      const authedCookie = await loginAs(app, 1);

      const ipAStatuses = await hammerPasswordEndpoint(app, RATE_LIMIT_MAX + 1, {
        cookie: authedCookie,
        remoteAddress: "10.0.0.1",
      });
      expect(ipAStatuses[RATE_LIMIT_MAX]).toBe(429);

      const ipBRes = await app.inject({
        method: "PATCH",
        url: "/profile/password",
        headers: { cookie: authedCookie },
        remoteAddress: "10.0.0.2",
        payload: { currentPassword: "WrongPassword1", newPassword: NEW_PASSWORD },
      });
      // IP Bにとってはまだ1回目の試行なので、レート制限ではなく通常の
      // 認証エラー(現在パスワード不一致による401)として処理される。
      expect(ipBRes.statusCode).toBe(401);
      await app.close();
    },
    15000
  );

  // one-step-further(feedback_test_one_step_further): ブロックは一時的であり、
  // 設定したウィンドウ(15分)が経過すれば再び要求が処理されることを確認する。
  // @fastify/rate-limitの既定ストア(LocalStore)は独自タイマーを持たず、
  // 呼び出しの都度Date.now()と記録済みの開始時刻を比較するだけなので、
  // 実際に15分待たなくてもDateだけを差し替えれば正しく検証できる。
  it(
    "レート制限のウィンドウ経過後は、要求が再び処理される",
    async () => {
      const { app } = await buildTestApp();
      const authedCookie = await loginAs(app, 1);

      const statuses = await hammerPasswordEndpoint(app, RATE_LIMIT_MAX + 1, {
        cookie: authedCookie,
      });
      expect(statuses[RATE_LIMIT_MAX]).toBe(429);

      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(Date.now() + RATE_LIMIT_WINDOW_MS + 1000));

      const afterWindowRes = await app.inject({
        method: "PATCH",
        url: "/profile/password",
        headers: { cookie: authedCookie },
        payload: { currentPassword: "WrongPassword1", newPassword: NEW_PASSWORD },
      });
      // ウィンドウが経過したのでレート制限は解除され、通常の認証エラー(401)に戻る
      // (429のままではないこと自体がこのテストの主張)。
      expect(afterWindowRes.statusCode).toBe(401);
      await app.close();
    },
    15000
  );
});
