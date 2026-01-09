Конечно — вот **полный README** для твоего проекта **Warpath Stats Tracker**, **единым блоком**:

---

# 🛠 Warpath Stats Tracker — README

## 🚀 Что это

**Warpath Stats Tracker** — сервис для сбора и анализа статистики игроков и альянсов из Warpath (YX DMZ Game):

✔ Сбор данных по игрокам (PID)
✔ Сбор данных по альянсам (GID)
✔ Хранение `raw` данных
✔ Преобразование в *snapshot-таблицы* (например, `AllianceSnapshot`)
✔ Построение временных рядов (`dataset_alliance_history`)
✔ API для выдачи данных
✔ Background-задачи (scheduler + очереди)
✔ Очереди для масштабируемых fetch/processing jobs

---

## 🧠 Архитектура системы

```
scheduler (cron)
       ↓ enqueue fetch jobs (BullMQ)
fetch-worker (queue)
       ↓ fetch raw JSON from Warpath API
process-worker
       ↓ process raw → snapshots → dataset
api
       ↑ REST API for querying metrics
Redis (queues)
PostgreSQL (storage via Prisma)
```

---

## 📦 Стек технологий

| Компонент       | Технология              |
| --------------- | ----------------------- |
| Язык            | TypeScript              |
| Очереди         | BullMQ                  |
| Очереди Backend | Redis                   |
| HTTP API        | Express                 |
| ORM             | Prisma 7                |
| БД              | PostgreSQL 16           |
| Dev runner      | pnpm + tsx              |
| Контейнеры      | Docker & docker-compose |

---

## 📁 Структура проекта

```
/
├─ src/
│   ├─ api/                   # REST API
│   ├─ bullmq/               # Очереди, connection
│   ├─ integrations/
│   │   └─ warpath/           # HTTP client для Warpath API
│   ├─ scheduler/
│   ├─ workers/
│   ├─ db/                    # Prisma client
├─ prisma/
│   ├─ schema.prisma
│   └─ prisma.config.ts
├─ Dockerfile
├─ docker-compose.yml
├─ .env.example
├─ tsconfig.json
├─ package.json
└─ README.md
```

---

## 🔗 Интеграция с Warpath API

HTTP-клиент в `src/integrations/warpath/warpath.client.ts` реализует:

```ts
async function fetchGuildDetail(gid, page, perPage)
async function fetchPidDetail(pid, page, perPage)
async function fetchRankPid(...)
```

---

## 🐘 База данных & Prisma

**Prisma 7** настроен через `prisma.config.ts`:

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://tracker:tracker@localhost:5432/tracker?schema=public",
  },
});
```

В `tsconfig.json`:

```json
{
  "module": "NodeNext",
  "moduleResolution": "NodeNext",
  "verbatimModuleSyntax": true,
  ...
}
```

---

## 🐳 Docker & Compose

### 🧩 docker-compose.yml

**PostgreSQL**:

```yaml
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_USER: tracker
    POSTGRES_PASSWORD: tracker
    POSTGRES_DB: tracker
  ports:
    - "5432:5432"
  volumes:
    - pg_data:/var/lib/postgresql/data
```

**Redis** (с паролем):

```yaml
redis:
  image: redis:7-alpine
  environment:
    REDIS_PASSWORD: ${REDIS_PASSWORD:-app_pass}
  command: >
    sh -c 'redis-server --requirepass "$$REDIS_PASSWORD" --save 60 1 --appendonly yes'
```

Сервисы API, Scheduler, Workers настроены подключаться к этим сервисам.

---

## 📦 Dockerfile (prod-like build)

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL="postgresql://tracker:tracker@postgres:5432/tracker?schema=public"
RUN pnpm prisma generate
RUN pnpm run build
RUN pnpm prune --prod

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/api/server.js"]
```

---

## 🛠 pnpm & Скрипты

В `package.json`:

```json
{
  "scripts": {
    "dev:api": "tsx src/api/server.ts",
    "dev:scheduler": "tsx src/scheduler/scheduler.ts",
    "dev:worker:fetch": "tsx src/workers/fetch.worker.ts",
    "dev:worker:process": "tsx src/workers/process.worker.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/api/server.js",
    "prisma:dbpush": "prisma db push",
    "prisma:generate": "prisma generate",
    "prisma:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^7.2.0",
    "bullmq": "^5.66.3",
    "express": "^5.2.1",
    "redis": "^5.10.0"
  },
  "devDependencies": {
    "prisma": "^7.2.0",
    "tsx": "^4.20.0",
    "typescript": "^5.6.3",
    "@types/node": "^20.11.30",
    "@types/express": "^5.0.5"
  }
}
```

Пакеты устанавливаются так:

```
pnpm add @prisma/client bullmq express redis
pnpm add -D prisma typescript tsx @types/node @types/express
```

---

## 📌 Пример `.env`

```
DATABASE_URL="postgresql://tracker:tracker@localhost:5432/tracker?schema=public"
REDIS_PASSWORD="app_pass"
REDIS_PORT=6379
BULL_PREFIX="warpath"
```

---

## 🧠 Как запускать

### Локальная разработка

```bash
pnpm dev:api
pnpm dev:scheduler
pnpm dev:worker:fetch
pnpm dev:worker:process
```

### Через Docker

```bash
docker compose down -v
docker compose up --build
```

---

## 💡 Prisma Studio

Чтобы запустить Studio локально:

```
pnpm prisma studio
```

Если Prisma жалуется на `No database URL`, создай `.env` с `DATABASE_URL`.

---

## 🧪 Проверка Redis auth

Подключение:

```ts
const redisConn = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
};
```

Проверка командой:

```
redis-cli -a app_pass ping
# PONG
```

---

## 📚 Обработка данных

### Scheduler

Ставит задачи в BullMQ по расписанию.

---

### Fetch Worker

Получает задачи → вызывает данные из Warpath API → сохраняет raw.

---

### Process Worker

Обрабатывает raw → строит snapshot → обновляет dataset.

---

### API

Отдаёт готовые данные по HTTP.

---

## ⚙️ Naming conventions

```
integrations/  — внешний API client
workers/       — фоновые задачи
bullmq/        — очереди
db/            — Prisma client
api/           — HTTP API
```

---

## 🛣 Next steps

✅ Собрать fetch → raw pipeline
✅ Реализовать snapshot/ dataset
✅ REST API endpoints

---

## 📌 Примечания

✔ Redis защищён паролем
✔ PostgreSQL слушает на всех интерфейсах
✔ Prisma генерится на этапе сборки
✔ В dev используем .env
