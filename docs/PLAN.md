# Implementation Plan: Multi-Platform Comment System

> **This is a living planning document, not a record of committed decisions.**
> It evolves as requirements are added and discussed. Every design choice here —
> including the ADRs listed below — is a **proposal under discussion** until we
> agree and it lands in code. ADRs will be authored with `Status: Proposed` and
> only move to `Status: Accepted` once agreed during implementation.
>
> **This file is temporary.** `docs/PLAN.md` will be **deleted once the plan is
> implemented**; the durable record then lives in the code, `docs/README.md`, and
> the accepted ADRs under `docs/adrs/`.

## Current state

- **Where we are:** implementation is underway. Done so far: docs & ADRs (tagged
  `architecture`), the project scaffold (TODO step 2 — `package.json`,
  `tsconfig.json`, `nest-cli.json`, `jest.config.js`, `.env.example`,
  `docker-compose.yml`), the Prisma schema + initial migration (step 3), the
  domain layer (step 4 — `src/domain/{comment,errors,http-status}.ts`), the auth
  module + `HttpClient` seam (step 5), the platforms module (step 6 — adapter
  contract, registry, Facebook adapter, stubs), and the repository layer (step 7 —
  `CommentRepository` contract, `PrismaService` + Prisma implementation, in-memory
  implementation, and a shared contract suite), and the comments module (step 8 —
  `CommentService` use cases, the controller with both routes, zod request DTOs +
  response mappers, and a shared `ZodValidationPipe` in `src/common`), and the
  common layer + bootstrap (step 9 — `AllExceptionsFilter` rendering the shared
  error envelope and logging only unexpected errors, `app.module.ts`, and
  `main.ts` mounting routes under `/api/v1`), and the integration + e2e test
  suites (step 10 — `PrismaCommentRepository` against a real PostgreSQL via the
  shared contract, and `supertest` against the booted app with the outbound
  `HttpClient` mocked). All unit + e2e tested at 100% coverage (`main.ts` is the
  one documented `istanbul ignore` per ADR 0008). The integration suite requires a
  reachable database (`docker compose up -d db`) and fails loudly if absent.
  All ADRs 0001–0014 are now `Status: Accepted`. ADR 0013 records the Prisma 7
  driver-adapter model (amends ADR 0004): connection config lives in
  `prisma.config.ts`, not `schema.prisma`. ADR 0014 records read-through pagination
  (amends ADR 0005): the platform owns paging, so the repository carries no cursor
  logic.
- **Decisions so far:** NestJS + TypeScript, PostgreSQL + Prisma (7, driver-adapter
  model) behind a repository interface, Adapter/Strategy for platforms (Facebook
  first, others stubbed), pass-through (BYOT) auth via `X-Platform-Token` behind a
  `TokenProvider` abstraction, persistence scoped so posts are the required anchor
  and comments a cache (ADR 0009), 95%+ coverage, CI with real Postgres, a manual
  live smoke test. All captured as accepted ADRs.
- **Next step:** TODO step 11 — the live smoke test app (`scripts/live-smoke`): a
  standalone Node entry point that builds the real `FacebookAdapter` (real
  `HttpClient`, static `TokenProvider` seeded from `--token`), fetches → replies →
  re-fetches against the real Graph API, and cleans up created resources (default
  `--cleanup=true`). Run manually with a real token; never in CI.
- **Deferred within the docs stage:** `docs/adding-a-platform.md` is intentionally
  postponed until the platforms module exists, so the guide matches real code.
- **How this section is maintained:** updated as we progress so it always
  reflects the true current position and the immediate next action.

## Context

We are building a comment system for a social-media scheduling API that supports
multiple platforms. Required capabilities:

- Retrieve comments for a published post
- Reply to a comment
- Support multiple social platforms
- Expose functionality through a REST API

Deliverables: database schema, API design, TypeScript implementation, and
documented design decisions.

The repo is currently greenfield (`README.md` + `.gitignore`). This plan builds a
**core vertical slice**: the two endpoints fully working, backed by
PostgreSQL/Prisma, with a platform **Adapter/Strategy** abstraction where one
adapter (**Facebook**) is fully implemented against the real Graph API and the
rest are explicit stubs. Design decisions are captured as **ADRs** (proposed
until agreed).

## Proposed decisions (under discussion)

These are current proposals, not settled decisions — they have already changed
across planning rounds and may change again. Each maps to a *proposed* ADR that
is only accepted once we agree during implementation.

| Area | Proposed choice | Rationale (full reasoning goes in the ADR) |
| --- | --- | --- |
| Framework | **NestJS + TypeScript** | Scope grew (auth, adapters, repos, CI); DI/guards/pipes/filters remove hand-wiring. ADR 0002 records the Express→NestJS switch and compares Express & Fastify |
| Persistence | PostgreSQL | Relational data (posts, threaded replies), integrity, idempotent-sync uniqueness. **ADR 0003 discusses alternatives: MySQL, MongoDB, key-value stores** |
| **Persistence scope** | **Posts required; comments an optional cache** | Posts are the anchor that makes our `postId` meaningful; the platform is the source of truth for comment content, so stored comments are a documented cache. ADR 0009 |
| ORM | Prisma | Type-safe client, schema doubles as docs; hidden behind a repository interface |
| Data access | Repository pattern | Decouple service from Prisma; enables in-memory impl for fast tests |
| Platform support | Adapter/Strategy | System supports multiple platforms; ADR weighs the abstraction cost vs. flexibility |
| **First real platform** | **Facebook (Graph API)** | Fully implemented; Twitter/X, Instagram, LinkedIn stubbed |
| **Auth** | **Pass-through bearer token (BYOT)** | Caller supplies token via `X-Platform-Token`; forwarded as `Authorization: Bearer` to the platform. Behind a `TokenProvider` abstraction (`RequestScopedTokenProvider`). ADR 0007 |
| Scope | Core vertical slice | Two endpoints end-to-end, one real adapter, others stubbed |
| Tests | In-memory repo (unit) + real Postgres in Docker (integration) | See Testing & CI |
| **Coverage** | **95% minimum, target 100%** | Enforced via Jest coverage thresholds and in CI |

## Architecture

NestJS modules, layered with dependency inversion. Nest's DI container wires the
providers; guards handle auth, pipes handle validation, and an exception filter
renders the error envelope:

```
HTTP layer      (Nest controllers, ValidationPipe/zod, exception filter -> error envelope)
   -> Service layer   (CommentService provider: business rules & orchestration)
      -> CommentRepository (injection token)  -> Prisma impl | InMemory impl
      -> PlatformAdapterRegistry              -> Facebook adapter | NotImplemented stubs
             -> HttpClient (token)  -> native fetch impl | mock (tests)
             -> TokenProvider (token) -> RequestScopedTokenProvider | static (tests)
```

Module layout: `AppModule` composes `CommentsModule` (controllers + service +
repository provider), `PlatformsModule` (adapter registry + adapters),
`AuthModule` (`TokenProvider`), and a shared `HttpModule`.

Key abstractions (all Nest providers, bound via injection tokens so tests swap
implementations through the testing module):

- **`CommentRepository`** decouples the service from Prisma; tests use an
  in-memory implementation with no database.
- **`PlatformAdapter`** (Adapter/Strategy) isolates per-platform API differences
  behind one contract, selected at runtime by a registry.
- **`TokenProvider`** (authentication abstraction) supplies the platform bearer
  token. This iteration uses a **`RequestScopedTokenProvider`** that returns the
  caller-supplied token from the request context (pass-through / BYOT); tests use
  a static provider. A server-side vault-sourced provider can be swapped in later
  without touching adapters (see ADR 0007 and the future-tasks backlog).
- **`HttpClient`** is the seam for outbound HTTP so the real adapter makes genuine
  Graph API calls in production while tests mock the boundary.

## Data model (`prisma/schema.prisma`)

**Role of the database** (see ADR 0009): we persist what genuinely requires storage
and treat the rest as a deliberate, reversible choice. **`Post` is required** — this
is a scheduling product, so `GET /posts/:postId/comments` is keyed on *our* `postId`,
and we must hold the mapping to `(platform, externalId)` recorded at publish time;
without it the ID resolves to nothing. **`Comment` storage is an optional cache** —
the platform is the source of truth; we store a projection for history, cross-platform
queries, and resilience, accepting staleness. `GET` fetches live and upserts
(idempotent on `(platform, externalId)`, `syncedAt` records recency); `POST reply`
calls the platform then persists the reply (also enabling idempotent reply handling).

**Comments added outside our system** (third parties replying directly on the
platform) are the primary input, not an edge case, and enter via the same fetch-and-
upsert path. This leaves a **freshness bound, not a correctness gap** — with no push
channel yet, the cache reflects platform state as of the last `GET`; closing that is
the deferred webhooks task.

- `Platform` enum: `FACEBOOK`, `TWITTER`, `INSTAGRAM`, `LINKEDIN` (extendable).
- `Post`: `id`, `platform`, `externalId`, `publishedAt`, timestamps. Unique on
  `(platform, externalId)`.
- `Comment`: `id`, `postId` (FK), `platform`, `externalId`, `authorHandle`,
  `content`, `parentCommentId` (nullable self-FK for threaded replies),
  `createdAt`, `syncedAt`, timestamps. Unique on `(platform, externalId)` for
  idempotent sync; indexes on `postId` and `parentCommentId`.

## Authentication

- Facebook Graph API is called with an **OAuth2 bearer token**
  (`Authorization: Bearer <access-token>`).
- **Pass-through / bring-your-own-token (BYOT):** the API caller supplies the
  platform access token on each request via a dedicated **`X-Platform-Token`**
  header. We forward it to the platform as `Authorization: Bearer <token>` and
  **never persist or log it**. The system is stateless with respect to
  credentials — no vault, no secret store, no prod/local environment switch.
- A `TokenProvider` interface still abstracts token acquisition so the design
  stays clean and swappable. This iteration binds a **`RequestScopedTokenProvider`**
  (a request-scoped NestJS provider) that returns the caller-supplied token from
  the current request context. Tests bind a static provider returning a fixed
  value. Adapters depend only on `TokenProvider`, so a future server-side
  vault-sourced provider swaps in without touching adapters or the service.
- **Dedicated header, not `Authorization`:** we deliberately do not reuse
  `Authorization` for the platform token, so that if we ever add authentication
  on *our own* API, `Authorization` is free for our credentials without conflict.
- **Security:** the token travels in every request, so this is only safe over
  **HTTPS/TLS**, and request/error logging must never capture `X-Platform-Token`.
  No secrets are hardcoded; no token is stored at rest.
- Full OAuth *authorization-code login UI*, token refresh/lifecycle, and
  server-side vault-sourced token storage are out of scope for this iteration
  (documented as non-goals; vault storage is on the future-tasks backlog).
- **ADR 0007** records the pass-through decision, the dedicated-header rationale,
  and alternatives considered (server-side vault-sourced token, full OAuth2 flow).

## REST API (`/api/v1`)

- `GET /posts/:postId/comments?limit&cursor` — fetch comments from the platform
  adapter, upsert them into the record (idempotent), and return them.
  Cursor-paginated, oldest-first. `404` if post missing/unpublished.
- `POST /comments/:commentId/replies` — body `{ content }`. Delegates to the
  platform adapter (real Graph API call), then persists. `201` created, `400`
  invalid content, `404` unknown comment, `501` platform not implemented,
  `502` upstream platform error.
- Consistent error envelope: `{ "error": { "code", "message" } }`. Validation via
  `zod` at the HTTP boundary.

## Testing & coverage

- **Unit tests:** `CommentService` against `InMemoryCommentRepository` + a fake
  adapter; the Facebook adapter against a mocked `HttpClient` and static
  `TokenProvider`. Covers retrieval, pagination, reply, validation, not-found,
  not-implemented, and upstream-error paths.
- **Integration tests (real DB):** run the `PrismaCommentRepository` against a
  **real PostgreSQL in Docker**, applying migrations first — verifies schema,
  relations, pagination, and idempotent upserts for real.
- **E2E tests:** `supertest` against the Nest application (built from a testing
  module with in-memory repo + mocked adapter) asserting HTTP status and shapes.
- **Coverage gate:** Jest `coverageThreshold` set to **95%** (statements,
  branches, functions, lines); we aim for 100% and only fall back to targeted
  `istanbul ignore` on genuinely untestable lines (e.g. the `main.ts` Nest
  bootstrap), documented where used.

## Live smoke test (real token against the real platform)

A standalone **Node application** (not bash) that exercises the real Facebook
Graph API end-to-end with a real access token. Run manually/locally — never in
CI (it needs a real token and makes live calls).

- **Location:** `scripts/live-smoke/` (its own small entry point, run via
  `npm run smoke -- --token <ACCESS_TOKEN> --post-id <ID>`). The token is passed
  as a **CLI parameter** (falls back to `FACEBOOK_ACCESS_TOKEN` env if omitted);
  it is never logged.
- **Flow:** builds the real `FacebookAdapter` (real `HttpClient`, static
  `TokenProvider` seeded with the passed token) → fetches comments for the given
  post → posts a reply → re-fetches to confirm the reply appears.
- **Cleanup mechanism:** every resource the smoke test creates (e.g. the reply
  comment) is tracked and deleted afterwards via the Graph API. Behaviour is
  **parameterised by `--cleanup` (default: `true` → clean up within the test
  run)**; pass `--cleanup=false` to leave created resources for manual
  inspection/cleanup. Cleanup runs in a `finally` block so it also fires on
  failure.
- **Exit codes:** `0` on success, non-zero on any failed assertion or API error,
  so it can be wired into a manual release checklist.

## CI/CD (GitHub Actions)

- Workflow `.github/workflows/ci.yml` on push/PR:
  1. Checkout, setup Node, `npm ci`.
  2. Type-check (`tsc --noEmit`).
  3. Start **PostgreSQL as a service container**; run `prisma migrate deploy`.
  4. Run unit + integration + e2e tests **with coverage**, enforcing the 95% gate.
- **Out of scope (noted in the workflow and docs):** security scanning (SAST/deps),
  container image publishing, and deployment. Placeholders/notes only.

## Files to create

```
package.json, tsconfig.json, jest.config.js, .env.example
docker-compose.yml                 local Postgres for integration tests
.github/workflows/ci.yml           CI pipeline
nest-cli.json                      Nest CLI config
prisma/schema.prisma
src/
  main.ts                          Nest bootstrap (entry point)
  app.module.ts                    root module composing feature modules
  config/env.ts                    validated env loading (Nest ConfigModule)
  domain/comment.ts                domain types
  domain/errors.ts                 typed errors -> HTTP status
  auth/auth.module.ts              wires the TokenProvider provider
  auth/token-provider.ts           TokenProvider interface + injection token
  auth/request-scoped-token-provider.ts  reads X-Platform-Token from request (BYOT)
  http-client/http-client.ts       HttpClient interface + native fetch impl (ADR 0010)
  platforms/platforms.module.ts    provides the adapter registry
  platforms/platform-adapter.ts    PlatformAdapter interface + registry
  platforms/facebook-adapter.ts    fully-implemented Graph API adapter (OAuth2 bearer)
  platforms/stubs.ts               NotImplemented adapters
  comments/comments.module.ts      controller + service + repository provider
  comments/comments.controller.ts  Nest controller (routes)
  comments/comment-service.ts      use cases
  comments/dto/                     request/response DTOs + zod validation
  repositories/comment-repository.ts       interface + injection token
  repositories/prisma-comment-repository.ts
  repositories/in-memory-comment-repository.ts
  common/all-exceptions.filter.ts  exception filter -> consistent error envelope
tests/
  unit/…                           service + adapter + auth unit tests
  integration/prisma-comment-repository.int.test.ts   real Postgres
  e2e/comments.e2e.test.ts         supertest against the app
  support/factories.ts, support/http-mock.ts
scripts/
  live-smoke/index.ts              standalone Node smoke test (real token, real API, cleanup)
docs/
  PLAN.md                          this plan (committed before implementation)
  README.md                        architecture & folder guide
  adding-a-platform.md             step-by-step: how to add a new adapter
  adrs/0001-record-architecture-decisions.md
  adrs/0002-use-nestjs-for-rest-api.md          NestJS chosen; Express/Fastify alternatives
  adrs/0003-use-postgresql-for-persistence.md   PostgreSQL; MySQL/MongoDB/KV alternatives
  adrs/0004-use-prisma-as-orm.md
  adrs/0005-use-repository-pattern.md
  adrs/0006-use-adapter-strategy-for-platforms.md
  adrs/0007-authenticate-with-oauth2-bearer-token.md  pass-through/BYOT; alternatives
  adrs/0008-testing-and-ci-strategy.md
  adrs/0009-persist-posts-cache-comments.md           posts required; comments cached
  adrs/0010-use-native-fetch-for-outbound-http.md     native fetch; undici/axios/got alternatives
  adrs/0011-pin-typescript-5x.md                      pin TS 5.x, not the native 7.0 compiler
  adrs/0012-target-node-22-lts.md                     Node 22 Active LTS runtime target
```

ADRs use the Nygard format (Status / Context / Decision / Consequences). They are
authored with **`Status: Proposed`** and only move to **`Status: Accepted`** once
agreed during implementation (a superseded decision gets a new ADR referencing the
old one). Each lists the alternatives considered and why the proposed option fits.

- **0002 NestJS** — records the Express→NestJS switch: as scope grew (auth,
  adapters, repositories, CI), Nest's DI, guards, pipes, and exception filters
  earn their weight over hand-wired Express; compares Express and Fastify.
- **0003 PostgreSQL** — why a relational store fits posts + threaded replies +
  idempotent-sync uniqueness, discussing MySQL, MongoDB, and key-value stores.
- **0005 Repository pattern** and **0006 Adapter/Strategy** — the two explicitly
  requested, each with alternatives.
- Plus **0007 Authentication** (pass-through/BYOT, dedicated `X-Platform-Token`
  header; server-side vault storage deferred to future tasks), **0008 Testing
  & CI**, **0009 Persistence scope** (posts required as the anchor; comments
  stored as an optional cache with the platform as source of truth), and
  **0010 Outbound HTTP** (native `fetch` behind the `HttpClient` seam; undici,
  axios, and got weighed as alternatives), **0011 TypeScript version** (pin the
  5.x line rather than the new native 7.0 compiler, which `typescript-eslint` and
  Nest 11 do not yet support), and **0012 Runtime** (target Node 22 Active LTS).

## Documentation deliverables

- `docs/README.md`: architecture overview, folder structure, data model, API
  reference, auth setup (pass-through `X-Platform-Token`, TLS-only, never logged),
  how to run locally/Docker, how to run tests & CI, and how to run the live smoke
  test (`npm run smoke -- --token … --post-id … [--cleanup=false]`).
- `docs/adding-a-platform.md` *(deferred until the platforms module exists)*: a
  concrete guide to adding a new social-network adapter — implement
  `PlatformAdapter`, wire a `TokenProvider`, register it, extend the `Platform`
  enum, add tests — with a checklist.
- ADRs in `docs/adrs/` documenting the major design decisions.
- Root `README.md`: project overview with a short pointer to `docs/`.

## Implementation TODO (ordered)

> **Docs first — show-stopper.** Step 1 (docs + ADRs) must be written and agreed
> before any implementation begins. If the design docs surface an unresolved
> decision, we stop and resolve it rather than coding around it.

1. **Docs & ADRs (BLOCKER) — done.** `docs/README.md` and the ADRs are written
   and pushed (tagged `architecture`). `docs/adding-a-platform.md` is deferred until
   the platforms module exists so it matches real code. This blocker is cleared.
2. **Project scaffold — done.** `package.json`, `tsconfig.json`, `nest-cli.json`,
   `jest.config.js` (coverage thresholds), `.env.example`, `docker-compose.yml`.
3. **Prisma schema + initial migration — done.** Prisma 7 driver-adapter model:
   connection config in `prisma.config.ts` (see ADR 0013), not `schema.prisma`.
4. **Domain types + typed errors — done.** `src/domain/{comment,errors,http-status}.ts`,
   unit-tested at 100%.
5. **Auth module — done.** `TokenProvider` interface + `RequestScopedTokenProvider`
   (reads `X-Platform-Token`) and the `HttpClient` seam (native fetch, ADR 0010).
6. **Platforms module — done.** `PlatformAdapter` interface + registry, Facebook
   adapter, not-implemented stubs.
7. **Repository layer — done.** `CommentRepository` interface + injection token,
   `PrismaService` + Prisma impl, in-memory impl, shared contract suite.
8. **Comments module — done.** `CommentService` (use cases) + controller + zod
   DTOs/validation and a shared `ZodValidationPipe` (`src/common`).
9. **Common — done.** `AllExceptionsFilter` (error envelope + logs unexpected
   errors only) + Nest bootstrap (`app.module.ts`, `main.ts`, `/api/v1` prefix).
10. **Tests — done.** Unit (100%), integration against real Postgres via the
    shared contract, and e2e (`supertest`, mocked `HttpClient`) — 95%+ gate met.
11. Live smoke test app (`scripts/live-smoke`) with token param + cleanup.
12. CI workflow `.github/workflows/ci.yml`.
13. Verify locally (install, generate, migrate, test, dev curl) then finalize.

Progress will be tracked in the session task list mirroring these steps.

## Future tasks (backlog / out of current scope)

Explicitly deferred; captured so the extension path is clear and reviewers see
what a production build would add next:

- **Remaining platform adapters:** implement Twitter/X, Instagram, LinkedIn
  (currently `NotImplemented` stubs).
- **Server-side token storage:** a vault-sourced `TokenProvider` (HashiCorp
  Vault / cloud secret manager) keyed per connected account, with a prod/local
  provider switch — so the service holds tokens instead of the caller passing
  them. Swaps in behind the existing `TokenProvider` seam.
- **Full OAuth2 flow:** authorization-code login + token refresh/exchange, rather
  than a caller-supplied pre-issued bearer token.
- **Webhooks / real-time sync:** ingest new comments via platform webhooks instead
  of on-demand fetches; reconcile with the idempotent-sync upsert.
- **Rate limiting & retries:** per-platform backoff, circuit breaker, and quota
  handling around `HttpClient`.
- **Pagination hardening:** opaque/encoded cursors, and time-window filters.
- **Observability:** structured logging, metrics, tracing across the HTTP boundary.
- **CI/CD hardening (deferred):** SAST + dependency scanning, container image
  build/publish, and deployment pipeline.
- **AuthZ:** per-tenant/account authorization on posts and comments.
- **ADR renderer:** tooling to render the `docs/adrs/` Markdown into a browsable
  index/site (e.g. an auto-generated table of contents with statuses, or a static
  site via a docs generator) so decisions are easy to browse outside the repo.

## Verification

1. `docker compose up -d db` then `npm run prisma:migrate` (schema applies).
2. `npm test` — unit + integration + e2e green, coverage ≥ 95%.
3. `npm run start:dev` and hit both endpoints with curl (documented in
   `docs/README.md`).
4. CI green on push (Postgres service container + coverage gate).

## Notes / non-goals

- Real Graph API calls happen in production via `HttpClient`; **tests mock the
  HTTP boundary** (no live Facebook calls in CI). Real-DB behaviour *is* tested
  against Postgres in Docker.
- OAuth authorization-code login UI / token issuance is out of scope; the caller
  supplies a pre-issued bearer token per request (`X-Platform-Token`, pass-through).
- Server-side token storage (vault) and token refresh/lifecycle are out of scope
  for this iteration, deferred to future tasks; the `TokenProvider` seam is kept
  so they can be added without touching adapters.
- Security scanning, image publishing, and deployment are out of CI scope (noted).
- Only Facebook is fully implemented; other platform adapters are intentionally
  stubbed to show the extension point without over-building.
```
