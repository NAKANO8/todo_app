FROM node:22

WORKDIR /app

# pnpm を有効化（Node 16+ 推奨の正規ルート）
RUN corepack enable

# 依存関係ファイルだけ先にコピー（Dockerキャッシュ効かせる）
COPY package.json pnpm-lock.yaml ./

# pnpm で install
RUN pnpm install

# 残りのソースをコピー
COPY . .

CMD ["pnpm", "run", "dev"]

