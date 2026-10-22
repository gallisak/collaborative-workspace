# Collab Docs

Notion-like collaborative workspace: nested pages, block editor with real-time CRDT editing (Yjs), public SSR/ISR pages, search, mock billing.

> Work in progress. Architecture notes will be expanded as stages land.

## Structure

```
backend/     NestJS — one codebase, several processes:
               src/main.ts    REST API          :4000
               src/collab.ts  collab gateway    :4001 (Yjs over WebSocket)
             src/infra/   config, health, prisma
             prisma/      schema and migrations
             src/modules/ business modules
frontend/    Next.js (App Router) + Feature-Sliced Design
               app/         routing only (Next.js)
               src/         FSD layers: app, pages, widgets, features, entities, shared
docker/      container init scripts
```

`frontend/pages/` is intentionally empty: without a root `pages/` folder Next.js would treat the FSD `src/pages` layer as the legacy Pages Router.

## Local development

Requirements: Node 24, npm, Docker.

```bash
cp .env.example .env
docker compose up -d                 # postgres :5432, redis :6380, minio :9000 (console :9001)

cd backend
npm install                          # also generates the Prisma client
npm run prisma:deploy                # apply migrations
npm run start:dev                    # REST API on :4000
npm run start:collab:dev             # collab gateway on :4001

cd frontend
npm install
npm run dev                          # :3000
```

Health checks: `GET http://localhost:4000/health`, `GET http://localhost:4001/health`.

## Environment profiles

- `.env.example` — development (services on `localhost`)
- `.env.test.example` — backend e2e tests (separate `collab_docs_test` database)
- `.env.staging.example` — staging (`docker compose --env-file .env.staging up -d`)

The backend loads `.env.${NODE_ENV}` first, then `.env`, both from the repo root.
