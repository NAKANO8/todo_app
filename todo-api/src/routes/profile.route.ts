// routes/profile.route.ts
//
// タスク3.1: 自分自身の表示名変更エンドポイント。admin.user.route.tsと同じパターン
// (プラグインスコープのガード、AJVによるボディ検証)を踏襲する(design.md
// "File Structure Plan" / "ProfileController" 参照)。
import { FastifyInstance } from "fastify";
import { ProfileController } from "../controllers/profile.controller";
import { requireAuthGuard } from "../guards/requireAuth";
import { nameFieldSchema } from "./auth.route";

// Requirement 2.2: 変更後の表示名は1〜50文字の範囲外なら拒否する。
// nameFieldSchemaはauth.route.ts(登録時のname検証)と共有し、再定義しない。
const updateNameSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: nameFieldSchema,
    },
    // Requirement 7.1: userId等の他フィールドを受け付けない。Fastify 5の既定AJV設定
    // (removeAdditional: true)により、未知フィールドは400にはならず黙って除去される
    // (auth.route.tsの同種コメント参照)。対象ユーザーはいずれにせよcontroller側で
    // req.session.userId! からのみ取得するため、この設定はあくまで多層防御。
    additionalProperties: false,
  },
} as const;

export async function profileRoutes(app: FastifyInstance) {
  // requireAuthGuard: 認証済み(req.session.userIdあり)判定の共有ガード
  // (guards/requireAuth.ts)。このプラグインのスコープ内に閉じたpreHandlerなので、
  // 他のルートには影響しない(Fastifyのカプセル化)。
  app.addHook("preHandler", requireAuthGuard);

  app.patch(
    "/profile/name",
    { schema: updateNameSchema },
    ProfileController.updateName
  );
}
