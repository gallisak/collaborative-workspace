# Collab Docs

A Notion-like collaborative workspace: nested pages, a block editor where several people edit the
same document in real time (CRDT, Yjs), public pages rendered on the server for SEO, full-text
search with access control, and a mock subscription billing with plan limits.

**Stack:** Next.js 16 (App Router, Cache Components) · NestJS · Yjs · PostgreSQL + Prisma ·
Redis + BullMQ · MinIO (S3) · Docker.

- [Quick start](#quick-start)
- [Features](#features)
- [Architecture](#architecture)
- [Frontend: Server and Client Components](#frontend-server-and-client-components)
- [Real-time collaboration and CRDT persistence](#real-time-collaboration-and-crdt-persistence)
- [Publishing and on-demand revalidation](#publishing-and-on-demand-revalidation)
- [Search](#search)
- [Billing](#billing)
- [Security](#security)
- [Consistency model](#consistency-model)
- [Observability](#observability)
- [Testing](#testing)
- [Trade-offs](#trade-offs)

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000`. Compose starts Postgres, Redis and MinIO, applies the migrations,
seeds demo data and runs the API, the collab gateway, the worker and the frontend behind an nginx
ingress. API docs (Swagger): `http://localhost:4000/api/docs`.

**Demo accounts** (password `Password123!`), all in one Free-plan workspace with three pages:

| Email               | Role   |
| ------------------- | ------ |
| `ann@collab.local`  | Owner  |
| `bob@collab.local`  | Editor |
| `cara@collab.local` | Viewer |

**Invitations.** Mail is mocked: the invitation link is written to the API log.

```bash
docker compose logs api | grep "Mail sent"
```

Open the link signed in with the invited email, or register with it from the sign-in page; you come
back to the invitation afterwards.

<details>
<summary>Local development without the app containers</summary>

```bash
docker compose up -d postgres redis minio minio-init

cd backend
npm install
npm run prisma:deploy && npm run db:seed
npm run start:dev            # REST API      :4000
npm run start:collab:dev     # collab gateway :4001
npm run start:worker:dev     # background jobs

cd frontend
npm install
npm run dev                  # :3000
```

Environment profiles: `.env.example` (development), `.env.test.example` (backend e2e, separate
database), `.env.staging.example` (staging). The backend loads `.env.${NODE_ENV}`, then `.env`.

</details>

## Features

- **Workspaces and roles.** Owner/Admin manage members, billing and settings, Editor creates and
  edits pages, Viewer reads. Invitations by email, role changes, leaving and deleting a workspace.
- **Page-level sharing.** A page and its subpages can be shared with any user as `VIEW` or `EDIT`;
  the nearest grant up the tree overrides the workspace role in both directions. People outside the
  workspace find such pages under "Shared with you".
- **Pages.** Nested pages, drag & drop reordering in the tree.
- **Editor.** Paragraphs, headings, lists, checklists, code blocks, links and images; live cursors
  and presence; works offline and syncs when the connection returns.
- **Version history.** Automatic and manual versions, preview and restore.
- **Comments.** Threads on blocks, `@mentions` with notifications.
- **Publishing.** Public read-only links or edit links for signed-in users, optionally expiring.
- **Search** across the pages you can open.
- **Billing.** Free / Pro / Team plans with limits on members, documents and storage, mock checkout.

## Architecture

```
backend/     NestJS — one codebase, one Docker image, three processes
               src/main.ts    REST API          :4000
               src/collab.ts  collab gateway    :4001  Yjs over WebSocket
               src/worker.ts  background jobs   :4002  BullMQ
             src/modules/   auth, workspaces, documents, permissions, collab, comments,
                            notifications, publishing, search, billing, attachments, versions
             prisma/        schema and migrations
frontend/    Next.js App Router + Feature-Sliced Design
               app/         routing only
               src/         app, pages, widgets, features, entities, shared
docker/      container init scripts, nginx ingress config
```

- **The collab gateway owns document content.** It keeps the live `Y.Doc` of every open document
  and is its only writer. The API checks access and enqueues work for it (manual versions,
  restores).
- **The worker runs everything that may lag behind edits:** search indexing, page revalidation,
  mention notifications, billing events, storage cleanup.
- **Authentication: JWT access + refresh tokens, not Auth.js.** The NestJS API is the single
  authority for users and permissions, and three processes plus the Next.js server need to verify
  a session. A signed access token (15 min) is verified locally by each of them from an `httpOnly`
  cookie, without a session store; the WebSocket gateway reads the same cookie. Refresh tokens
  (30 days) rotate on every use, and reusing a rotated one revokes the whole session.

`frontend/pages/` is intentionally empty, otherwise Next.js would treat the FSD `src/pages` layer
as the Pages Router.

## Frontend: Server and Client Components

**The rule.** Everything is a Server Component unless it needs the browser: local state, event
handlers, a live connection or browser APIs. Data for the first paint is loaded on the server and
passed to Client Components as typed, serializable props. Types are generated from the OpenAPI
schema, so there is no `any` on the boundary. Client Components never fetch the data a page is
built from, only what changes while the user works.

| Server Components                                        | Client Components                                     |
| -------------------------------------------------------- | ----------------------------------------------------- |
| public page `/p/:token` (ISR, no client code of its own) | block editor: Yjs, WebSocket, presence, offline state |
| page loaders: document access, members, billing          | document tree with drag & drop                        |
| settings, search results, checkout summary               | comments, mentions, version history                   |
| dashboard sections, streamed independently               | forms, share menu, image upload, notifications        |
| layouts and the navigation shell                         |                                                       |

**Next.js primitives and why.**

- **ISR + on-demand revalidation for public pages.** They must be SEO-friendly and can change at
  any moment. See [Publishing](#publishing-and-on-demand-revalidation).
- **No server cache for private data.** It is per user and permission sensitive, so the data
  access layer fetches it with `no-store` and only deduplicates within a request. The expensive
  document tree is cached in Redis on the backend, where invalidation is exact.
- **Streaming SSR.** The workspace dashboard has independent sections (pages, mentions, members,
  plan usage), each with its own `<Suspense>` and error boundary: the shell arrives immediately and
  a failing section shows "Try again" without breaking the others.
- **Proxy (`proxy.ts`, the Next 16 middleware).** Separates public routes from private ones,
  redirects signed-out users to the login page with a safe `next`, and refreshes an expired access
  token before rendering.
- **Server Actions vs real-time.** Settings-style mutations go through Server Actions (workspace,
  members, invitations, share links, checkout), each validated with zod. Tree operations call the
  API from the browser for instant feedback. Document content never goes through either: it is a
  Yjs update on the WebSocket.
- **One place for errors.** On the server the data access layer turns `401` into sign-out, `404`
  into `notFound()` and the rest into `error.tsx`; in the browser errors become toasts with the
  correlation id, and plan limits (`402`) link to the plans. The connection state of the editor
  lives in one `CollabSession`.
- **States.** Every screen has loading skeletons, empty states and error states; the editor shows
  online, offline and reconnecting and keeps accepting input while offline.

## Real-time collaboration and CRDT persistence

The gateway speaks the standard y-websocket protocol at `ws://<collab-host>/documents/<id>`. On
connect it checks the `Origin` and the access token cookie and resolves access with the same rules
as the API. Viewers receive the document and live changes, but their own updates are dropped on
the server. Presence always carries the authenticated user.

**Persistence strategy.**

1. Every update is applied to the in-memory `Y.Doc` and broadcast to the room.
2. Updates are buffered and appended to `document_updates` as one merged row every
   `COLLAB_FLUSH_INTERVAL_MS` (1 s).
3. After `COLLAB_COMPACTION_THRESHOLD` rows (100), or when the last client leaves, the full state is
   written to `document_states` and the covered rows are deleted in the same transaction. This is
   what keeps the update log from growing forever.
4. On a cold start the gateway loads the snapshot and replays the newer rows, read in one
   `REPEATABLE READ` transaction so a concurrent compaction cannot hide rows.
5. A failed write keeps the buffer and is retried with backoff; a room is unloaded only after
   everything is written. On shutdown every room is written and clients are told to reconnect
   (`1012`) before the process exits.

**Why it converges.** Yjs merges concurrent edits character by character, so there is no "last
write wins", and applying the same update twice is harmless. Offline edits are sent when the
connection returns.

**Versions.** An automatic version every `VERSION_INTERVAL_MS` of editing and when the last client
leaves; manual versions on request. A restore first saves the current state as "Before restore",
then applies the old content as a normal CRDT change, so everyone connected sees it at once.

**Access changes while editing.** After member, sharing, move or delete changes the API publishes
an event, and the gateway re-checks the open sessions; it also re-checks every session on each
heartbeat in case an event is lost. Lost access closes the session (`4404`), a changed access level
reloads the editor (`4409`), a signed-out session is closed (`4401`).

## Publishing and on-demand revalidation

A manager of a page creates a `VIEW` link (public read-only page) or an `EDIT` link (signed-in
users can edit through it), optionally with an expiry. Tokens are 192-bit random values; revoking or
expiring a link takes effect at once for the API and open sessions.

**Server rendering and SEO.** `/p/:token` is a Server Component. `generateMetadata` builds the
title, description, canonical URL and Open Graph tags from the document. Only published pages are
indexable, the rest of the app is `noindex`.

**Sanitization.** The API returns the content as JSON blocks built from a whitelist: only known
block types and attributes, only `http(s)` images and `http(s)`/`mailto` links. Raw HTML,
`javascript:` and `data:` URLs and unknown nodes are dropped. The frontend validates the response
with zod and renders each block type to a fixed React element; there is no
`dangerouslySetInnerHTML`.

**Revalidation.** `getPublicDocument` is a `'use cache'` function tagged `public-document:<id>`.
When the gateway saves changes of a published page, it enqueues a revalidation job with a delay and
a per-document deduplication key, so a page is revalidated at most once per `REVALIDATE_DELAY_MS`
however fast people type, and editing is never blocked. The worker calls `POST /internal/revalidate`
(secret compared in constant time), which runs `revalidateTag`; the next visitor gets fresh content
without a redeploy. Renames, deletions and revoked or expired links revalidate the page too.

## Search

**Why Postgres full-text search, not Meilisearch.** At this scale (thousands of documents per
workspace) a GIN index over `tsvector` answers in milliseconds, and the access check runs in the
same SQL query against live data, so a document someone just lost access to never appears. With an
external engine the access rules would have to be copied and kept in sync. It is also one service
less to run. Meilisearch would pay off with typo tolerance or much larger volumes.

**Query.** The input is split into words and turned into a prefix query (`word:*`); it never reaches
`tsquery` syntax raw. The `simple` configuration fits multilingual content (Postgres has no
Ukrainian stemmer). Titles weigh more than the body. Members see all pages of the workspace,
guests only pages shared with them and their subpages.

**Index consistency.** Indexing is asynchronous, never part of the request that saves a change:
saving, creating or renaming a document enqueues a job that reads the latest state. Jobs are
deduplicated per document, and an older result never overwrites a newer one (guarded by the last
update id). A periodic reconcile job re-indexes anything a lost job left stale. Results lag edits by
a few seconds; access and deletion are always checked at query time.

## Billing

| Plan | Members | Documents | Storage |
| ---- | ------- | --------- | ------- |
| Free | 3       | 100       | 100 MB  |
| Pro  | 10      | unlimited | 10 GB   |
| Team | 50      | unlimited | 100 GB  |

Exceeding a limit returns `402` with an explanation, and the UI offers the plans.

**Mock Stripe Checkout.**

1. An owner or admin starts a checkout; the API creates a checkout session and returns its page.
2. Paying builds a `checkout.session.completed` event, signs it with HMAC-SHA256 and delivers it to
   `POST /api/billing/webhook`, exactly as an external provider would.
3. The webhook verifies the signature over the raw body (5 minute tolerance), stores the event by
   its provider id and answers `200` at once; processing runs in the worker.
4. The worker locks the event, the session and the workspace, re-checks the limits of the new plan
   and switches the plan in one transaction.

**Idempotency.** A redelivered event is detected by its id and not processed again, an already
processed event is skipped inside the locked transaction, and a second event for a completed
session is ignored, so a payment is never applied twice. If the team outgrew the plan between
checkout and payment, the session becomes `FAILED` with the reason.

**Attachments.** Images (PNG, JPEG, GIF, WebP, no SVG) never pass through the API: the browser
uploads them to MinIO with a presigned POST that pins the key, the exact size and the type. The
storage limit is checked before signing and the object is verified after upload. Images are served
through short-lived presigned URLs, to anyone only when the page is published.

## Security

- **Access control on every layer.** Every API request resolves access to the workspace and the
  document; a Viewer cannot edit through a direct API call (`403`), and a document of a workspace you
  have no access to answers `404` even by its id. The collab gateway applies the same rules.
- **Validation.** DTOs with class-validator on the backend (unknown fields are rejected), zod on
  the frontend and in Server Actions.
- **XSS.** User content is sanitized on the server before any server rendering; the editor accepts
  only web and email links.
- **CSRF.** `SameSite` cookies and an `Origin` check on every mutating request with a session.
- **Rate limits** (Redis): sign-in per email and per IP, share link creation per user, everything
  else per IP. The ingress overwrites `X-Forwarded-For`, so the client address cannot be forged.
- **Secrets.** In production the backend refuses to start with example secrets.

## Consistency model

| Strong (same transaction or query)                  | Eventual (through queues)                 |
| --------------------------------------------------- | ----------------------------------------- |
| permissions: every request and WebSocket session    | search index (seconds behind)             |
| plan limits and plan changes (workspace row locked) | public pages (revalidated seconds after)  |
| billing events (locked, processed once)             | mention notifications, automatic versions |
| document content (CRDT: converges, nothing is lost) |                                           |

Rights and money must never be stale: a viewer must not write because a cache is behind, and a plan
must not be applied twice. Search, public pages and notifications can lag by seconds without harm,
and making them asynchronous keeps editing fast and lets a job be retried when a dependency is
down. They still never leak: access and link validity are checked against live data at read time.

**Edge cases.**

- **Two people edit the same block:** both changes are merged by Yjs.
- **A page is deleted while someone edits it:** the session is closed and the editor shows that the
  page is no longer available.
- **Publishing with unsaved local changes:** the public page shows what the server has persisted;
  offline edits sync on reconnect and trigger a new revalidation.
- **The same CRDT update or webhook arrives twice:** Yjs updates are idempotent, webhook events are
  deduplicated by their id.

## Observability

- **Logs:** structured JSON (pino). Every request gets a correlation id (`X-Correlation-Id`) that is
  carried through the queues to the worker, so one id links, for example, a webhook delivery to
  "Workspace plan changed". Key events are logged: page published, link revoked, plan changed,
  duplicate webhook. Cookies and link tokens are redacted.
- **Metrics:** `GET /metrics` (Prometheus) on every process: HTTP latency by route, open documents
  and connections, queue sizes, published pages, plan changes, webhook deliveries.
- **Health:** `GET /health` and `GET /health/ready` (database and Redis) on every process.

## Testing

```bash
cd backend  && npm test && npm run test:e2e   # unit and API e2e
cd frontend && npm test                       # unit and component tests
cd frontend && npx playwright test            # browser e2e against a running stack
```

- **Unit:** permission resolution with page sharing, CRDT merge and persistence, webhook signature
  and idempotency, plan limits, sanitization.
- **API e2e:** workspace → page → invite a Viewer → the Viewer cannot edit through the API; two
  clients editing one document without losing changes; publishing and revalidation; billing.
- **Playwright:** the same critical flows in a real browser, plus offline editing, version history,
  comments, search and image upload.

CI (GitHub Actions) runs lint, typecheck, unit and e2e tests for both apps on every push and pull
request, builds the images and runs Playwright against `docker compose`.

## Trade-offs

What I would do differently with more time:

- **One collab gateway instance.** Scaling out needs sticky routing per document or a shared Yjs
  backend such as y-redis.
- **ISR cache in memory.** Several frontend instances need a shared `cacheHandler` (Redis).
- **Polling for comments and notifications.** Server-sent events or the existing WebSocket would
  be more immediate.
- **Mock billing and mail.** No proration, refunds or cancellation; invitations go to the log
  instead of a mail provider.
- **CSRF tokens** on top of the `Origin` check and `SameSite` cookies in production.
- **An image proxy** for external images, so other sites do not see visitors' addresses.
