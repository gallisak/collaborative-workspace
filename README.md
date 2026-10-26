# Collab Docs

Notion-like collaborative workspace: nested pages, block editor with real-time CRDT editing (Yjs), public SSR/ISR pages, search, mock billing.

Stack: Next.js 16 (App Router, Cache Components) · NestJS · Yjs · PostgreSQL + Prisma · Redis + BullMQ · MinIO · Docker.

## Structure

```
backend/     NestJS — one codebase, one Docker image, several processes:
               src/main.ts    REST API          :4000
               src/collab.ts  collab gateway    :4001 (Yjs over WebSocket)
               src/worker.ts  background jobs   :4002 (BullMQ: notifications, search indexing, page revalidation, billing events, storage cleanup)
             src/infra/   config, health, prisma
             prisma/      schema and migrations
             src/modules/ business modules
frontend/    Next.js (App Router) + Feature-Sliced Design
               app/         routing only (Next.js)
               src/         FSD layers: app, pages, widgets, features, entities, shared
docker/      container init scripts and the nginx ingress config
```

`frontend/pages/` is intentionally empty: without a root `pages/` folder Next.js would treat the FSD `src/pages` layer as the legacy Pages Router.

## Running with Docker

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000` and sign in with a [demo account](#demo-data).

This starts Postgres, Redis and MinIO, applies migrations and seeds demo data (one-shot `migrate`
container, `SEED_DEMO_DATA=false` to skip), then runs `api` (:4000), `collab` (:4001) and
`worker` (:4002) from one backend image and `web` from the frontend image behind `ingress`
(nginx, :3000). The backend
image is a multi-stage build: `build` compiles, `migrate` keeps the Prisma CLI, `runtime` contains
only production dependencies and the compiled code. The frontend image is a Next.js standalone
build. The backend and frontend images run as the unprivileged `node` user, the ingress uses the
unprivileged nginx image. Every service has a healthcheck; services
start only after their dependencies are healthy, migrations succeeded and the bucket exists.
Containers run with `NODE_ENV=development` by default so that the example secrets are accepted;
production requires real secrets (see [Environment profiles](#environment-profiles)).

Addresses inside the compose network are fixed (`http://api:4000`, `http://web:3000`), addresses the
browser uses (`FRONTEND_URL`, `NEXT_PUBLIC_COLLAB_URL`, `S3_PUBLIC_ENDPOINT`) come from `.env`.
`NEXT_PUBLIC_COLLAB_URL` is inlined into the client bundle, so it is a build argument of the image.

**Client address.** Rate limits are per client IP, so the API must see the real one. The `ingress`
is the only public entry: it overwrites `X-Forwarded-For` with the address of the connection, so a
client cannot forge it. Next.js passes that header on to the API both for proxied `/api` calls and
for its own server-side requests (Server Components, Server Actions, the session refresh in the
proxy), and the API trusts exactly one hop (`TRUST_PROXY=1`). Without the ingress (`npm run dev`)
the header is not rewritten, which is fine on a developer machine but not in production.

## Local development

Requirements: Node 24, npm, Docker.

```bash
cp .env.example .env
docker compose up -d postgres redis minio minio-init   # :5432, :6380, :9000 (console :9001)

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

`npm run db:seed` creates a Free-plan workspace with three pages ("Getting started" with the
"Roadmap" subpage, and "Team notes") and three members, password `Password123!`:

| Email               | Role   |
| ------------------- | ------ |
| `ann@collab.local`  | Owner  |
| `bob@collab.local`  | Editor |
| `cara@collab.local` | Viewer |

API docs: `http://localhost:4000/api/docs`.

## Authentication

**JWT access + refresh tokens, not Auth.js.** The NestJS API is the single authority for users,
sessions and permissions, and three processes (REST API, collab gateway, worker) and the Next.js
server all need to verify a session. A signed access token is verified locally by each of them, the
WebSocket gateway reads it from the same cookie, and no session store is queried per request.
Auth.js would put the session into the Next.js app and make NestJS trust it second hand.

- The access token lives 15 minutes (`JWT_ACCESS_TTL`), the refresh token 30 days
  (`REFRESH_TOKEN_TTL`). Both are `httpOnly`, `SameSite=Lax` cookies, `Secure` in production.
- Refresh tokens are random, stored as an HMAC, and rotated on every use. Tokens of one sign-in form
  a family: reusing an already rotated token revokes the family and every access token of the user
  (theft detection). Two tabs refreshing at the same moment are allowed within
  `REFRESH_ROTATION_GRACE_SECONDS`.
- Logging out revokes the refresh family and the access tokens of that session only; other devices
  stay signed in. Open editor sessions of a signed out session are closed with `4401` on the next
  heartbeat (`COLLAB_HEARTBEAT_MS`).
- The Next.js proxy refreshes an expired access token before rendering, the browser client retries
  a `401` once after refreshing.
- Mutating requests that carry a session cookie must come from an allowed `Origin` (CSRF).

**Rate limits** (Redis, shared by all API instances): sign-in 5 attempts per minute per email from
any address and 20 per minute per IP, each blocked for a minute after that
(`LOGIN_EMAIL_RATE_LIMIT_PER_MINUTE`, `LOGIN_IP_RATE_LIMIT_PER_MINUTE`); share link creation per
user (`SHARE_LINK_RATE_LIMIT_PER_MINUTE`); everything else per IP (`RATE_LIMIT_PER_MINUTE`). The IP
comes from the ingress, see [Client address](#running-with-docker).

## Workspaces, members and sharing

Roles: Owner and Admin manage members, billing and settings, Editor creates and edits pages,
Viewer reads. In Settings an admin invites by email, changes roles and removes members (only of a
lower role), anyone but the owner can leave, and the owner can delete the workspace.

**Accepting an invitation.** There is no real mail delivery: `MailService` writes the message to
the API log instead of sending it. Invite someone in Settings, then take the link from the log:

```bash
docker compose logs api | grep "Mail sent"   # or the terminal of `npm run start:dev`
```

Open `http://localhost:3000/invitations/accept?token=…` signed in with the invited email (the
invitation is bound to it). Without an account, choose "Create one" on the sign-in page and register
with that email; you come back to the invitation afterwards. Invitations expire after
`INVITATION_TTL` (7 days), inviting the same email again replaces the previous one, and pending
invitations count towards the member limit of the plan.

**Sharing a single page.** A manager can give any registered user `VIEW` or `EDIT` access to a page
and its subpages, also to people outside the workspace. The nearest grant on the way up the tree
wins over the workspace role, in both directions: a viewer can be allowed to edit one page, an
editor can be limited to reading it. People outside the workspace find those pages under "Shared
with you" (`GET /api/shared-documents`) and in the sidebar of that workspace. Removing a member also
removes their page grants.

## Frontend: Server and Client Components

**The rule.** Everything is a Server Component unless it needs the browser: local state, event
handlers, a live connection or browser APIs. Data for the first paint is loaded on the server and
handed to Client Components as typed, serializable props (types are generated from the OpenAPI
schema, so there is no `any` on the boundary). Client Components are leaves: they never fetch the
data a page is built from, only what changes while the user works.

| Server Components                                            | Client Components                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| public page `/p/:token` (ISR, no client code of its own)     | block editor: Yjs, WebSocket, presence, offline indicator      |
| page loaders: document access, members, share links, billing | document tree with drag & drop                                 |
| settings, billing, search results, checkout summary          | comments, mentions, version history (they poll)                |
| dashboard sections, streamed independently                   | forms (`useActionState`), share menu, image upload, pay button |
| layouts and the navigation shell                             | notifications bell                                             |

**Next.js primitives and why.**

- **Cache Components + ISR for public pages.** `getPublicDocument` is a `'use cache'` function
  tagged `public-document:<id>` with `cacheLife('days')` as a safety net. After the first visit
  the page is served from the ISR cache (`x-nextjs-cache: HIT`). Changes do not wait for the
  timer: the worker calls `POST /internal/revalidate` (Bearer `REVALIDATE_SECRET`, compared in
  constant time), which runs `revalidateTag(tag, { expire: 0 })`, so the next visitor gets the new
  content and a revoked link is gone. `generateStaticParams` returns one placeholder token because
  Cache Components require a parameter at build time; real tokens are secret, so pages are
  rendered on the first visit and cached after it. The API response is validated with zod and
  rendered through a whitelist renderer: every block type maps to a fixed React element, there is
  no `dangerouslySetInnerHTML`, links get `rel="noopener noreferrer nofollow ugc"`.
- **SEO.** `generateMetadata` builds the title, description, canonical URL and Open Graph tags
  from the document. Private pages and shared-edit pages are `noindex`.
- **Private data is never cached on the server.** It is per user and permission sensitive, so the
  data access layer (`src/shared/dal`) fetches it with `cache: 'no-store'` and only deduplicates
  within one request (`React.cache`). Reads that are expensive are cached on the backend, where
  invalidation is exact: the document tree lives in Redis and is dropped on every tree change.
- **Streaming SSR.** The workspace dashboard has independent sections (mentions, members, plan
  usage, pages). Each one has its own `<Suspense>` and its own error boundary (`catchError`), so
  the shell arrives immediately, every section streams in as soon as its request finishes and a
  failing section shows "Try again" without breaking the others.
- **Proxy (`proxy.ts`, the Next 16 name of middleware).** Separates public routes (`/p`, auth
  pages) from private ones (`/w`, `/workspaces`, `/s`, `/billing`), redirects signed-out users to
  the login page with a safe `next`, refreshes an expired access token and forwards the new
  cookies. The check is optimistic (expiry only, no database); the API is the authority.
- **Server Actions vs real-time.** Settings-style mutations go through Server Actions: rename and
  delete the workspace, invite and revoke, change roles, remove members and leave, share links,
  start and pay a checkout. Each validates its input with
  zod and calls `refresh()`. Interactive tree operations call the API from the browser for instant
  feedback. Document content never goes through either: it is a Yjs update on the WebSocket.
- **One place for errors.** Server: `load`/`mutate` in the DAL turn `401` into a clean sign-out,
  `404` into `notFound()` and other statuses into an `ApiError`, rendered by `error.tsx`. Browser:
  `unwrap` + `notifyError` (toast with the correlation id), and plan limits (`402`) offer a link to
  the plans. The CRDT connection state lives in one `CollabSession`, which maps close codes to
  states (connecting, online, offline, no access, signed out, access changed, sync failed) for the
  indicator and the editor.
- **States.** Every page has a skeleton while it loads, empty states with a next step, and errors
  either inline (forms, sections) or through `error.tsx`/`not-found.tsx`. The editor shows offline
  and reconnecting states and keeps accepting input; Yjs syncs it when the connection is back.

The frontend follows Feature-Sliced Design, checked with steiger.

## Real-time collaboration

The collab gateway (`backend/src/collab.ts`) speaks the standard y-websocket protocol at
`ws://<collab-host>/documents/<documentId>`.

**Connection.** The `Origin` must be allowed and the `access_token` cookie valid. Access is
resolved with the same rules as the REST API. Viewers receive the document and live changes, but
their own updates are dropped on the server. Presence always carries the authenticated user, and a
connection can only change its own presence entries.

**Close codes** (the y-websocket client treats 4400–4499 as final and stops reconnecting):
`4400` malformed message, `4401` not authenticated, `4403` origin not allowed, `4404` no access or
document deleted, `4409` access level changed (the editor reloads the page to pick up the new rights
and the server state), `1012` server restart.

**Persistence.**

1. Every update is applied to the in-memory `Y.Doc` and broadcast to the room.
2. Updates are buffered and appended to `document_updates` as one merged row every
   `COLLAB_FLUSH_INTERVAL_MS`.
3. After `COLLAB_COMPACTION_THRESHOLD` rows, or when the last client leaves, the full state is
   written to `document_states` together with `last_update_id`, and the covered rows are deleted
   in the same transaction.
4. Cold start loads the snapshot and replays rows with `id > last_update_id`, both read in one
   `REPEATABLE READ` transaction so a compaction in between cannot hide rows. The public page and
   the search indexer read the same way. Yjs updates are idempotent, so an update that ends up both
   in the snapshot and in the log is harmless.
5. A failed write keeps the buffer and retries on its own with a growing delay. A room is unloaded
   only after everything is written.
6. On shutdown (`SIGTERM`) the gateway stops accepting connections and running jobs, writes every
   room, takes the final versions and closes the clients with `1012`, which makes them reconnect.
   Only then are the HTTP server and the database connection closed.

**Versions.** The gateway takes an automatic version every `VERSION_INTERVAL_MS` of editing and
when the last client leaves (only if something changed), keeping the newest
`VERSION_RETENTION_AUTO` automatic ones. Manual versions and restores go through the BullMQ
`collab` queue: the API checks access and enqueues, the gateway executes, because it owns the live
`Y.Doc` and is the only writer of document content. Repeated requests for the same document are
deduplicated while one is waiting. A restore first saves the current state as a named "Before
restore" version (kept like manual versions, not pruned), then replaces the content as a regular
CRDT change, so everyone connected sees it immediately. Text typed into existing blocks at the very
moment of a restore goes into the replaced blocks and is lost; it stays in "Before restore".

**Access changes.** The API publishes `collab:access-changed` (Redis pub/sub) after member,
role, sharing, move and delete changes. The gateway re-resolves access for open sessions: a session
that lost access is closed with `4404`, a session whose level changed (edit ↔ view) is closed with
`4409` and the editor reloads, so the user never types into a page whose edits the server drops.
Pub/sub is fire-and-forget, so the gateway also
re-checks every session on each heartbeat (`COLLAB_HEARTBEAT_MS`) and after reconnecting to Redis,
and closes sessions whose access token was revoked (logout, refresh token reuse) with `4401`. A
share link expiry closes its sessions on time, however far away it is.

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
documents or comments are hidden. If the queue is unavailable the comment is still saved; a
repeatable `mentions.reconcile` job (every 5 minutes, comments of the last day) re-enqueues mentions
that have no notification yet. Removing a member deletes their document grants and their
notifications in that workspace; unsharing or moving a page deletes the notifications of pages the
user can no longer see.

## Publishing

A manager of a document creates share links: `VIEW` (public read-only page) or `EDIT` (signed in
users who open the link can edit it in real time), optionally with an expiry. Link creation is rate
limited per user (`SHARE_LINK_RATE_LIMIT_PER_MINUTE`), tokens are 192-bit random values, and
revoking or expiring a link takes effect immediately for the public API and for open collaboration
sessions (an expiry timer and the access-changed event close them with `4404`, or `4409` when the
user still has access of their own); the cached public page is revalidated within
`REVALIDATE_DELAY_MS`. The revalidation is queued before the change: if the queue is unavailable,
revoking or creating an expiring link fails with `503` and changes nothing, so a revoked page is
never left in the cache.

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
`REVALIDATE_SECRET` and retries with backoff if the frontend is unavailable. Renames, deletion of
a page or of the whole workspace, revoking and expiry of a link revalidate the page too. Visitors
may see content up to a few seconds old (eventual consistency); local edits that have not reached
the server yet are not published.

**SEO.** Only published pages are indexable; every other page of the app is `noindex`.

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

Plans: Free (3 members, 100 documents, 100 MB), Pro (10 members, 10 GB), Team (50 members,
100 GB). Limits are enforced when inviting and accepting members, creating documents and uploading
images, with `402` and an explanation instead of an error.

The flow mirrors Stripe Checkout with a mock provider:

1. An owner or admin starts a checkout (`POST /api/workspaces/:id/billing/checkout`). The API
   creates a checkout session with an expiry and returns the URL of the payment page. Switching to
   a plan the workspace does not fit (members, documents or storage) is refused with `409`.
2. Paying (`POST /api/billing/checkout-sessions/:id/pay`) is the mock provider: it builds a
   `checkout.session.completed` event and delivers it to the webhook signed with HMAC-SHA256
   (`Billing-Signature: t=<timestamp>,v1=<hex>`), exactly as an external provider would call
   `POST /api/billing/webhook`.
3. The webhook verifies the signature over the raw body (with a 5 minute tolerance against
   replays), stores the event in `billing_events` keyed by the provider event id and answers `200`
   right away. Processing runs in the worker through the `billing` queue.
4. The worker locks the event, the checkout session and the workspace (`FOR UPDATE`) and, in one
   transaction, checks the limits of the new plan against the current usage again, switches the
   plan, upserts the subscription, completes the session and marks the event processed. If the
   team grew between checkout and payment, the plan is not changed: the session becomes `FAILED`
   with the reason, which the payment page shows (a real provider would refund here).

**Idempotency.** A redelivered event is detected by its id (`ON CONFLICT DO NOTHING`), logged as a
duplicate delivery and not processed again. An already processed event is skipped inside the
locked transaction, so concurrent deliveries cannot apply it twice. A different event for an
already completed session is ignored, so a payment is never applied twice. Plan changes are
strongly consistent: the workspace row is locked by both the plan change and the limit checks.

## Attachments

Images are stored in S3-compatible storage (MinIO locally) and never pass through the API:

1. `POST /api/documents/:id/attachments` with name, type and exact size. The API checks edit
   access, the allowed types (PNG, JPEG, GIF, WebP; no SVG because it can carry scripts), the
   per-file limit (`ATTACHMENT_MAX_BYTES`, `413` above it) and the storage limit of the plan, then returns a
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
removes uploads that were never completed, together with their objects. Deleting a workspace
removes all objects under its prefix, once right away and once more after the upload window, so a
late upload is not left behind. Two S3 clients are used:
one talks to MinIO from the backend (`S3_ENDPOINT`), the other only signs URLs for the browser
(`S3_PUBLIC_ENDPOINT`), because the signature covers the host. MinIO allows CORS only from the
frontend origin.

## Observability

**Logs** are structured JSON (pino). Cookies, the `Authorization` header and public link tokens in
request paths are redacted. Every HTTP request gets a correlation id (taken from
`X-Correlation-Id` or generated) that is returned in the response header and attached to every log
line of the request together with the user id. Background jobs carry the correlation id of the
request that enqueued them and the worker restores it, so one id links the whole chain, for
example webhook delivery → `billing` queue → "Workspace plan changed" in the worker. Key events
are logged explicitly: document published, share link revoked, workspace plan changed, duplicate
billing webhook delivery, rejected webhook signature.

**Metrics** (`/metrics`, labelled with `service` = `api`, `collab` or `worker`):

- `http_request_duration_seconds` by method, route template (never raw ids) and status;
- `collab_connections` and `collab_open_documents`;
- `queue_jobs` by queue and state (waiting, delayed, active, failed), exported by the worker;
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

## Consistency model

| Strong (checked in the same transaction or query)      | Eventual (asynchronous, through queues)                   |
| ------------------------------------------------------ | --------------------------------------------------------- |
| permissions: every request and every WebSocket session | search index (seconds behind edits)                       |
| plan limits and plan changes (workspace row locked)    | public pages (ISR, revalidated a few seconds after edits) |
| billing events (locked, processed once)                | mention notifications                                     |
| document content (CRDT: converges, nothing is lost)    | automatic versions                                        |

Rights and money must never be stale: a viewer must not write because a cache is behind, and a plan
must not be applied twice. Search, published pages and notifications can lag by seconds without
harm, and making them asynchronous keeps editing fast and lets a job be retried when a dependency
is down. Search results and published pages still never leak: access and link validity are
checked against live data at read time.

## Edge cases

- **Two people edit the same block.** Yjs merges both changes character by character; there is no
  "last write wins". Covered by unit tests of the merge and an e2e test with two browsers.
- **A document is deleted while someone edits it.** The API publishes an access change, the gateway
  closes the session with `4404` and the editor switches to "This page is no longer available".
  Edits still in the buffer are written to the log of the deleted page, which nobody can open.
- **Deleting a page with subpages.** Every subpage goes with it, so an editor needs edit access to
  each of them; a subpage shared with them as view-only makes the request fail with `403`. Owners
  and admins can always delete.
- **Publishing with unsaved local changes.** The public page shows what the server has persisted.
  Offline edits are sent when the connection returns and trigger a new revalidation.
- **The same CRDT update or webhook arrives twice.** Yjs updates are idempotent; a webhook event is
  stored under its provider id and processed once.

## Testing

```bash
cd backend  && npm test && npm run test:e2e   # unit (permissions, CRDT merge, webhooks) and API e2e
cd frontend && npm test                       # unit and component tests (Vitest)
cd frontend && npx playwright test            # browser e2e against a running stack
```

Playwright covers the critical flows end to end: a viewer cannot edit in the UI, two people editing
at once, publishing → SSR/ISR page → edit → revalidated content → revoked link, plan limit → mock
checkout → lifted limit, search, image upload. CI (GitHub Actions) runs lint, typecheck, unit and
e2e tests for both apps, builds both images and runs Playwright against `docker compose`.

## Trade-offs and what I would do differently

- **One collab gateway instance.** Scaling out needs sticky routing per document or a shared Yjs
  backend (y-redis).
- **ISR cache in memory.** Fine for one frontend instance; several instances need a shared
  `cacheHandler` (Redis) so that a revalidation reaches all of them.
- **Polling for comments and notifications.** Simple and robust; with more time they would use
  server-sent events or the existing WebSocket.
- **The first visit of an unknown public link answers `200` with `noindex`** while the page
  streams; later visits get `404` from the cache.
- **Mock billing only.** No proration, refunds or cancellation; a paid plan can be switched to
  another paid plan, not back to Free.
- **Access tokens in cookies, refresh in the proxy.** Good for SSR; a production setup would add
  CSRF tokens on top of the `Origin` check and `SameSite` cookies.
- **Mail is a log line.** A real setup would send invitations through an SMTP or API provider.
- **Images from other sites are loaded directly.** They are sent without a referrer, but the other
  site still sees the visitor's address; an image proxy would hide it.
