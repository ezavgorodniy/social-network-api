# Multi-Platform Comment System

A REST API for retrieving comments on published social-media posts and replying to
them across multiple platforms. **Facebook** (Graph API) is fully implemented;
Twitter/X, Instagram, and LinkedIn are registered as explicit stubs that mark the
extension point.

> For a high-level project overview and getting-started steps, see the
> [root `README.md`](../README.md). **Design decisions** live as Architecture
> Decision Records under [`docs/adrs/`](adrs/). **Adding a new platform** is
> documented in [`docs/adding-a-platform.md`](adding-a-platform.md).

## Assumptions

The requirements leave some details unspecified; these are the assumptions this
implementation makes. Each is a deliberate, reversible choice, recorded in the ADRs.

- **Posts are published through this system.** "A published post" is one this
  scheduling product published, so we hold the mapping from our `postId` to the
  platform's `(platform, externalId)`. Persisting posts is therefore *required*, not
  optional — the API's IDs are meaningless without it. ([ADR 9](adrs/0009-persist-posts-cache-comments.md))
- **The platform is the source of truth for comments; we cache.** Comments are
  fetched live and stored as a projection for history, cross-platform queries, and
  resilience — accepting staleness between reads. Storage here is a reasoned
  trade-off, not a requirement. ([ADR 9](adrs/0009-persist-posts-cache-comments.md))
- **The caller supplies the platform token per request** (`X-Platform-Token`,
  pass-through / BYOT). We do not manage or store platform credentials this
  iteration. ([ADR 7](adrs/0007-authenticate-with-oauth2-bearer-token.md))
- **One platform is fully implemented (Facebook).** The rest are explicit stubs that
  fail loudly, demonstrating the extension point without over-building.
  ([ADR 6](adrs/0006-use-adapter-strategy-for-platforms.md))
- **Retrieval is on-demand, not real-time.** There is no webhook/push ingestion yet;
  the cache reflects platform state as of the last `GET`. Webhooks are a future task.
- **No authentication or authorization on our own API yet.** Adding it later is why
  the platform token uses a dedicated header rather than `Authorization`.
  ([ADR 7](adrs/0007-authenticate-with-oauth2-bearer-token.md))

## Architecture

The application is a set of NestJS modules layered with dependency inversion.
Nest's DI container wires the providers; a validation pipe validates input, a guard
supplies the per-request platform token, and an exception filter renders a
consistent error envelope.

```
HTTP layer      (Nest controllers, validation pipe, exception filter -> error envelope)
   -> Service layer   (CommentService: business rules & orchestration)
      -> CommentRepository (injection token)  -> Prisma impl | InMemory impl
      -> PlatformAdapterRegistry              -> Facebook adapter | NotImplemented stubs
             -> HttpClient   -> fetch/undici impl | mock (tests)
             -> TokenProvider -> RequestScopedTokenProvider | static (tests)
```

Key seams, all bound via Nest injection tokens so tests can swap implementations:

- **`CommentRepository`** decouples the service from Prisma; tests use an in-memory
  implementation with no database. See [ADR 5](adrs/0005-use-repository-pattern.md).
- **`PlatformAdapter`** (Adapter/Strategy) isolates per-platform API differences
  behind one contract, selected at runtime by a registry. See
  [ADR 6](adrs/0006-use-adapter-strategy-for-platforms.md).
- **`TokenProvider`** supplies the platform bearer token. This iteration binds a
  `RequestScopedTokenProvider` that returns the caller-supplied token
  (pass-through / BYOT). See [ADR 7](adrs/0007-authenticate-with-oauth2-bearer-token.md).
- **`HttpClient`** is the outbound-HTTP seam: real Graph API calls in production,
  mocked at the boundary in tests.

## Folder structure

```
prisma/schema.prisma                Data model + migrations
src/
  main.ts                           Nest bootstrap (entry point)
  app.module.ts                     Root module composing feature modules
  config/env.ts                     Validated env loading
  domain/comment.ts                 Domain types
  domain/errors.ts                  Typed errors -> HTTP status
  auth/                             TokenProvider + RequestScopedTokenProvider (BYOT)
  http-client/                      HttpClient interface + fetch/undici impl
  platforms/                        PlatformAdapter interface, registry, Facebook, stubs
  comments/                         Controller + service + DTOs/validation
  repositories/                     CommentRepository interface + Prisma & in-memory impls
  common/                           Exception filter (error envelope)
tests/
  unit/                             Service + adapter + auth unit tests
  integration/                      PrismaCommentRepository against real Postgres
  e2e/                              supertest against the app
  support/                          Test factories + HTTP mocks
scripts/live-smoke/                 Standalone live smoke test (real token, real API)
docs/                               This guide, the platform guide, and ADRs
```

## Data model

### What we persist, and why

We persist what genuinely *requires* storage, and treat everything else as a
deliberate, cost-bearing choice. See
[ADR 9](adrs/0009-persist-posts-cache-comments.md) for the full reasoning.

- **`Post` — required.** This is a scheduling product, so "a published post" means one
  published *through our system*. `GET /posts/:postId/comments` is keyed on **our**
  `postId`, so we must have recorded the post at publish time, mapping our id to
  `(platform, externalId)`. Without it, `:postId` resolves to nothing. Posts are the
  anchor that makes the API's IDs meaningful.
- **`Comment` — optional cache.** The platform is the **source of truth** for comment
  content. Storing comments is a projection we adopt deliberately for its value
  (history, cross-platform queries, resilience to platform outages), accepting the
  cost (staleness between reads, duplication). `GET .../comments` fetches live from
  the platform adapter, upserts the results (idempotent on `(platform, externalId)`),
  and returns them; `syncedAt` records recency.
- **Replies we author — persisted.** Recording replies we post gives an audit of our
  actions and a basis for idempotent reply handling (no double-post on retry).

#### Comment sources & freshness

Most comments are **not** authored through this API — they are posted directly on
the platform by third parties, and are the primary input rather than an edge case.
They enter the cache through the retrieval path: because `GET .../comments` fetches
live and upserts on `(platform, externalId)`, an externally authored comment appears
the first time its post is requested (and updates, never duplicates, on later
fetches). `authorHandle` records who wrote it; nothing assumes we authored a comment.

The consequence is a **freshness bound, not a correctness gap**: with no push channel
yet, the cache reflects platform state only as of the last `GET`. Closing that gap —
capturing external comments as they happen — is the deferred webhooks / real-time
sync task.

- **`Platform`** enum: `FACEBOOK`, `TWITTER`, `INSTAGRAM`, `LINKEDIN` (extendable).
- **`Post`**: `id`, `platform`, `externalId`, `publishedAt`, timestamps. Unique on
  `(platform, externalId)`.
- **`Comment`**: `id`, `postId` (FK), `platform`, `externalId`, `authorHandle`,
  `content`, `parentCommentId` (nullable self-FK for threaded replies), `createdAt`,
  `syncedAt`, timestamps. Unique on `(platform, externalId)` for idempotent sync;
  indexed on `postId` and `parentCommentId`.

See [ADR 3](adrs/0003-use-postgresql-for-persistence.md) for why PostgreSQL and
[ADR 4](adrs/0004-use-prisma-as-orm.md) for why Prisma.

## API reference (`/api/v1`)

All requests that reach a platform must carry the platform access token in the
**`X-Platform-Token`** header (see [Authentication](#authentication)).

### `GET /posts/:postId/comments`

Retrieve comments for a published post: fetches from the platform, upserts them
into the record, and returns them. Cursor-paginated, oldest-first.

Query parameters:

| Name     | Type   | Default | Description                          |
| -------- | ------ | ------- | ------------------------------------ |
| `limit`  | number | `20`    | Page size.                           |
| `cursor` | string | —       | Opaque cursor from a previous page.  |

Responses: `200` with `{ data: Comment[], nextCursor: string | null }`; `404` if
the post is missing or unpublished.

### `POST /comments/:commentId/replies`

Reply to a comment. The service delegates to the platform adapter (a real Graph API
call for Facebook), then persists the created reply.

Request body: `{ "content": string }`.

Responses: `201` with the created reply; `400` invalid content; `404` unknown
comment; `501` platform not implemented; `502` upstream platform error.

### Error envelope

All errors share one shape:

```json
{ "error": { "code": "NOT_FOUND", "message": "Post not found" } }
```

## Authentication

This iteration uses a **pass-through / bring-your-own-token (BYOT)** model
(see [ADR 7](adrs/0007-authenticate-with-oauth2-bearer-token.md)).

- The caller supplies the platform access token on each request via the dedicated
  **`X-Platform-Token`** header. The service forwards it to the platform as
  `Authorization: Bearer <token>` and **never persists or logs it**.
- A dedicated header is used **instead of `Authorization`** so that adding
  authentication on our own API later does not conflict with the downstream
  platform token.

> **Security:** the token travels in every request. Serve the API over **HTTPS/TLS
> only**, and never log the `X-Platform-Token` value. No secrets are hardcoded and
> no token is stored at rest.

Server-side token storage (vault) and full OAuth2 login/refresh are out of scope
for this iteration and captured as future tasks.

## Running locally

Prerequisites: Node.js, Docker (for PostgreSQL).

```bash
npm ci
cp .env.example .env                 # then fill in the values
docker compose up -d db              # start local PostgreSQL
npm run prisma:migrate               # apply migrations
npm run start:dev                    # start the API in watch mode
```

Example requests (replace the token and IDs):

```bash
# Retrieve comments for a post
curl -H "X-Platform-Token: <ACCESS_TOKEN>" \
  http://localhost:3000/api/v1/posts/<POST_ID>/comments

# Reply to a comment
curl -X POST \
  -H "X-Platform-Token: <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Thanks for the feedback!"}' \
  http://localhost:3000/api/v1/comments/<COMMENT_ID>/replies
```

## Testing

See [ADR 8](adrs/0008-testing-and-ci-strategy.md) for the full strategy.

```bash
npm test                 # unit + integration + e2e, with the 95% coverage gate
```

- **Unit** tests run against the in-memory repository and a mocked `HttpClient` — no
  database, no network.
- **Integration** tests run `PrismaCommentRepository` against the Dockerized
  PostgreSQL (start it with `docker compose up -d db` first).
- **E2E** tests drive the Nest app with `supertest`.

CI (GitHub Actions) runs the same suite on push/PR with a PostgreSQL service
container and enforces the coverage gate. Security scanning, image publishing, and
deployment are out of CI scope for this iteration.

## Live smoke test

A standalone Node application that exercises the **real Facebook Graph API** with a
real token. Run it manually — never in CI.

```bash
npm run smoke -- --token <ACCESS_TOKEN> --post-id <POST_ID> [--cleanup=false]
```

It fetches comments for the post, posts a reply, and re-fetches to confirm the reply
appears. Every resource it creates is deleted afterwards (cleanup defaults to `true`
and runs even on failure); pass `--cleanup=false` to leave them for inspection. The
token is passed as a CLI parameter (falling back to `FACEBOOK_ACCESS_TOKEN`) and is
never logged. Exit code is `0` on success, non-zero on any failure.
