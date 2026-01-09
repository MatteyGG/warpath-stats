# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

# ---------- deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ---------- build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Генерируем Prisma Client на этапе билда
# Нужен DATABASE_URL (даже dummy), чтобы Prisma не падал
ENV DATABASE_URL="postgresql://tracker:tracker@postgres:5432/tracker?schema=public"
RUN pnpm prisma generate

# Собираем TS → JS
RUN pnpm run build

# Удаляем devDependencies
RUN pnpm prune --prod

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./

CMD ["node", "dist/api/server.js"]
