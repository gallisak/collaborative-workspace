# Collab Docs

Notion-like collaborative workspace: nested pages, block editor with real-time CRDT editing (Yjs), public SSR/ISR pages, search, mock billing.

> Work in progress. Architecture notes will be expanded as stages land.

## Structure

```
backend/     NestJS — one codebase, several processes:
               src/main.ts    REST API          :4000
               src/collab.ts  collab gateway    :4001 (Yjs over WebSocket)
               src/worker.ts  background jobs   :4002 (BullMQ: notifications, search indexing, page revalidation, billing events, upload cleanup)
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

Health checks on every process (`:4000`, `:4001`, `:4002`): `GET /health` (alive) and `GET /health/ready`
(database and Redis reachable, `503` otherwise). Prometheus metrics: `GET /metrics`.

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

## Billing

Plans: Free (3 members, 100 documents), Pro (10 members), Team (50 members). Limits are enforced
when inviting members and creating documents, with `402` and an explanation instead of an error.

The flow mirrors Stripe Checkout with a mock provider:

1. An owner or admin starts a checkout (`POST /api/workspaces/:id/billing/checkout`). The API
   creates a checkout session with an expiry and returns the URL of the payment page. Switching to
   a plan smaller than the current team is refused with `409`.
2. Paying (`POST /api/billing/checkout-sessions/:id/pay`) is the mock provider: it builds a
   `checkout.session.completed` event and delivers it to the webhook signed with HMAC-SHA256
   (`Billing-Signature: t=<timestamp>,v1=<hex>`), exactly as an external provider would call
   `POST /api/billing/webhook`.
3. The webhook verifies the signature over the raw body (with a 5 minute tolerance against
   replays), stores the event in `billing_events` keyed by the provider event id and answers `200`
   right away. Processing runs in the worker through the `billing` queue.
4. The worker locks the event, the checkout session and the workspace (`FOR UPDATE`) and, in one
   transaction, switches the plan, upserts the subscription, completes the session and marks the
   event processed.

**Idempotency.** A redelivered event is detected by its id (`ON CONFLICT DO NOTHING`), logged as a
duplicate delivery and not processed again. An already processed event is skipped inside the
locked transaction, so concurrent deliveries cannot apply it twice. A different event for an
already completed session is ignored, so a payment is never applied twice. Plan changes are
strongly consistent: the workspace row is locked by both the plan change and the limit checks.

## Attachments

Images are stored in S3-compatible storage (MinIO locally) and never pass through the API:

1. `POST /api/documents/:id/attachments` with name, type and exact size. The API checks edit
   access, the allowed types (PNG, JPEG, GIF, WebP; no SVG because it can carry scripts), the
   per-file limit (`ATTACHMENT_MAX_BYTES`) and the storage limit of the plan, then returns a
   presigned POST. Its policy pins the object key, the exact size and the content type, so storage
   itself rejects anything else.
2. The browser uploads the file straight to MinIO, then calls `POST /api/attachments/:id/complete`.
   The API checks the object in storage (size and type) before counting it as uploaded.
3. The document stores the stable URL `/api/attachments/:id/content`. It redirects to a
   short-lived presigned GET for readers of the document, and for anyone when the document is
   published. The public page sanitizer accepts exactly this path besides `http(s)` URLs.

**Storage limits.** Free 100 MB, Pro 10 GB, Team 100 GB. The check runs under the same workspace
lock as other limits and counts uploads in progress (reservations within `ATTACHMENT_UPLOAD_TTL`),
so parallel uploads cannot exceed the plan; exceeding it answers `402`. Usage is shown in
`GET /api/workspaces/:id/billing`. Deleting an attachment frees its space; a repeatable worker job
removes uploads that were never completed, together with their objects. Two S3 clients are used:
one talks to MinIO from the backend (`S3_ENDPOINT`), the other only signs URLs for the browser
(`S3_PUBLIC_ENDPOINT`), because the signature covers the host. MinIO allows CORS only from the
frontend origin.

## Observability

**Logs** are structured JSON (pino). Every HTTP request gets a correlation id (taken from
`X-Correlation-Id` or generated) that is returned in the response header and attached to every log
line of the request together with the user id. Background jobs carry the correlation id of the
request that enqueued them and the worker restores it, so one id links the whole chain, for
example webhook delivery → `billing` queue → "Workspace plan changed" in the worker. Key events
are logged explicitly: document published, share link revoked, workspace plan changed, duplicate
billing webhook delivery, rejected webhook signature.

**Metrics** (`/metrics`, labelled with `service` = `api`, `collab` or `worker`):

- `http_request_duration_seconds` by method, route template (never raw ids) and status;
- `collab_connections` and `collab_open_documents`;
- `queue_jobs` by queue and state (waiting, delayed, active, failed);
- `documents_published_total`, `billing_plan_changes_total`,
  `billing_webhook_deliveries_total{outcome="accepted|duplicate|rejected"}`;
- default Node.js process metrics (memory, CPU, event loop lag, GC).

`/metrics` has no authentication and is meant to be scraped on the internal network only; it is
not routed through the public `/api` prefix.

## Environment profiles

- `.env.example` — development (services on `localhost`)
- `.env.test.example` — backend e2e tests (separate `collab_docs_test` database)
- `.env.staging.example` — staging (`docker compose --env-file .env.staging up -d`)

The backend loads `.env.${NODE_ENV}` first, then `.env`, both from the repo root.
