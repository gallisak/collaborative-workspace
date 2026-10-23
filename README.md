# Collab Docs

Notion-like collaborative workspace: nested pages, block editor with real-time CRDT editing (Yjs), public SSR/ISR pages, search, mock billing.

> Work in progress. Architecture notes will be expanded as stages land.

## Structure

```
backend/     NestJS — one codebase, several processes:
               src/main.ts    REST API          :4000
               src/collab.ts  collab gateway    :4001 (Yjs over WebSocket)
               src/worker.ts  background jobs   (BullMQ: notifications, search indexing, page revalidation)
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
npm run start:worker:dev             # background jobs

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

**Versions.** The gateway takes an automatic version every `VERSION_INTERVAL_MS` of editing and
when the last client leaves (only if something changed), keeping the newest
`VERSION_RETENTION_AUTO` automatic ones. Manual versions and restores go through the BullMQ
`collab` queue: the API checks access and enqueues, the gateway executes, because it owns the live
`Y.Doc` and is the only writer of document content. A restore first saves the current state as
"Before restore", then replaces the content as a regular CRDT change, so everyone connected sees it
immediately and edits made at the same moment are merged instead of lost.

**Access changes.** The API publishes `collab:access-changed` (Redis pub/sub) after member,
role, sharing, move and delete changes. The gateway re-resolves access for open sessions: they are
downgraded to read-only or closed with `4404`.

**Limitations.** Rooms live in one gateway process. Running several gateway instances requires
routing all connections of a document to the same instance (or a shared Yjs backend such as
y-redis).

## Comments and notifications

Comments form threads attached to a block (`blockId` is the editor's stable block id). Reading
threads needs view access; commenting, replying and resolving need edit access, because viewers are
read-only. A comment can be deleted by its author or a document manager (soft delete; a thread
without comments disappears).

Mentions are sent as user ids next to the text. The API accepts only users who can see the
document, stores the comment and enqueues `mentions.notify` (job id = comment id). The worker
re-checks access at delivery time and inserts notifications with a unique
`dedupe_key = mention:<comment>:<user>`, so a retried or duplicated job never creates a second
notification. Authors are not notified about their own mentions, and notifications of deleted
documents or comments are hidden.

## Publishing

A manager of a document creates share links: `VIEW` (public read-only page) or `EDIT` (signed in
users who open the link can edit it in real time), optionally with an expiry. Link creation is rate
limited per user (`SHARE_LINK_RATE_LIMIT_PER_MINUTE`), tokens are 192-bit random values, and
revoking or expiring a link takes effect immediately for the public API and for open collaboration
sessions (an expiry timer and the access-changed event close them with `4404`).

`GET /api/public/documents/:token` needs no session and returns the title, an SEO description and
the content as sanitized JSON blocks. Sanitization happens on the server against a whitelist:
only paragraph, heading, bullet/ordered/task list, code block and image nodes, only known
attributes, only `http(s)` image sources and `http(s)`/`mailto` links. Anything else, such as raw
HTML, `javascript:` or `data:` URLs, or unknown nodes and attributes, is dropped, and text is never
interpreted as markup.

**Revalidation.** Public pages are cached by Next.js (ISR). After the gateway persists changes of a
published document, it enqueues `page.revalidate` with a delay and a BullMQ deduplication key per
document, so a page is revalidated at most once per `REVALIDATE_DELAY_MS` however fast people
type, and editing is never blocked by it. The worker calls `REVALIDATE_URL` with
`REVALIDATE_SECRET` and retries with backoff if the frontend is unavailable. Renames, deletion,
revoking and expiry of a link revalidate the page too. Visitors may see content up to a few seconds
old (eventual consistency); local edits that have not reached the server yet are not published.

## Search

**Why Postgres full-text search, not Meilisearch.** At this scale (thousands of documents per
workspace) a GIN index over `tsvector` answers in milliseconds, and the access check runs in the
same SQL query against the same transactional data. That way a document someone just lost access
to can never appear in results, whereas with an external engine the access rules would have to be
copied into it and kept in sync. It is also one service less to run. Meilisearch would pay off with
typo tolerance or much larger volumes.

**Query.** `GET /api/workspaces/:id/search?q=` splits the input into words (any alphabet) and
builds a prefix query (`word:*`, all words must match). The input never reaches `tsquery` syntax
unescaped. The `simple` configuration is used because content is multilingual (Ukrainian and
English) and Postgres has no Ukrainian stemmer; prefix matching covers most word forms. Titles
have a higher weight than the body. Workspace members see all documents; guests see only pages
shared with them and their subpages, the same rule the permission resolver applies.

**Indexing is asynchronous.** Saving content (collab gateway), creating and renaming a document
enqueue `document.index`. The worker loads the current Y.Doc, extracts plain text and upserts
`document_search`. Jobs carry only the document id and always read the latest state, so a repeated
or late job is harmless. A deduplication key per document keeps at most one waiting and one
running job, which also stops a burst of typing from producing a job per keystroke. The upsert is
guarded by `indexed_update_id`, so a result computed from an older state never overwrites a newer
one.

**Consistency.** The index is eventually consistent: results lag edits by about
`SEARCH_INDEX_DELAY_MS` plus processing time. Access rights and deletion are always strongly
consistent because they are checked against the live tables at query time. A repeatable
`index.reconcile` job (`SEARCH_RECONCILE_INTERVAL_MS`) re-enqueues documents whose index is missing
or older than their content or title, so a lost job (for example while Redis was down) and the
seeded demo documents are indexed too.

## Environment profiles

- `.env.example` — development (services on `localhost`)
- `.env.test.example` — backend e2e tests (separate `collab_docs_test` database)
- `.env.staging.example` — staging (`docker compose --env-file .env.staging up -d`)

The backend loads `.env.${NODE_ENV}` first, then `.env`, both from the repo root.
