FROM node:22

WORKDIR /app

# pnpm を有効化（Node 16+ 推奨の正規ルート）
RUN corepack enable

# 依存関係ファイルだけ先にコピー（Dockerキャッシュ効かせる）
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY todo-web/package.json ./todo-web/package.json

# pnpm で install
RUN pnpm install --frozen-lockfile

# 残りのソースをコピー
COPY todo-web ./todo-web

ENV NODE_ENV=production

RUN pnpm build

CMD ["pnpm", "run", "start"]

