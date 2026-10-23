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
npm run db:seed                      # demo users and workspace
npm run start:dev                    # REST API on :4000
npm run start:collab:dev             # collab gateway on :4001

cd frontend
npm install
npm run dev                          # :3000
```

Health checks: `GET http://localhost:4000/health`, `GET http://localhost:4001/health`.

## Demo data

`npm run db:seed` creates a Free-plan workspace with three members, password `Password123!`:

| Email               | Role   |
| ------------------- | ------ |
| `ann@collab.local`  | Owner  |
| `bob@collab.local`  | Editor |
| `cara@collab.local` | Viewer |

API docs: `http://localhost:4000/api/docs`.

## Real-time collaboration

The collab gateway (`backend/src/collab.ts`) speaks the standard y-websocket protocol at
`ws://<collab-host>/documents/<documentId>`.

**Connection.** The `Origin` must be allowed and the `access_token` cookie valid. Access is
resolved with the same rules as the REST API. Viewers receive the document and live changes, but
their own updates are dropped on the server. Presence always carries the authenticated user, and a
connection can only change its own presence entries.

**Close codes** (the y-websocket client treats 4400–4499 as final and stops reconnecting):
`4400` malformed message, `4401` not authenticated, `4403` origin not allowed, `4404` no access or
document deleted, `1012` server restart.

**Persistence.**

1. Every update is applied to the in-memory `Y.Doc` and broadcast to the room.
2. Updates are buffered and appended to `document_updates` as one merged row every
   `COLLAB_FLUSH_INTERVAL_MS`.
3. After `COLLAB_COMPACTION_THRESHOLD` rows, or when the last client leaves, the full state is
   written to `document_states` together with `last_update_id`, and the covered rows are deleted
   in the same transaction.
4. Cold start loads the snapshot and replays rows with `id > last_update_id`. Yjs updates are
   idempotent, so an update that ends up both in the snapshot and in the log is harmless.

**Access changes.** The API publishes `collab:access-changed` (Redis pub/sub) after member,
role, sharing, move and delete changes. The gateway re-resolves access for open sessions: they are
downgraded to read-only or closed with `4404`.

**Limitations.** Rooms live in one gateway process. Running several gateway instances requires
routing all connections of a document to the same instance (or a shared Yjs backend such as
y-redis).

## Environment profiles

- `.env.example` — development (services on `localhost`)
- `.env.test.example` — backend e2e tests (separate `collab_docs_test` database)
- `.env.staging.example` — staging (`docker compose --env-file .env.staging up -d`)

The backend loads `.env.${NODE_ENV}` first, then `.env`, both from the repo root.
