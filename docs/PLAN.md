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

- **Where we are:** planning only. Repo contains `README.md`, `.gitignore`, and
  this `docs/PLAN.md`. No implementation code exists yet.
- **Decisions so far (proposed, evolving):** NestJS + TypeScript, PostgreSQL +
  Prisma, Repository pattern, Adapter/Strategy for platforms (Facebook first,
  others stubbed), OAuth2 bearer auth with a vault-backed token store and a
  prod/local switch, 95%+ test coverage, CI with real Postgres, a manual live
  smoke test. All captured as *proposed* ADRs, not yet accepted.
- **Next step:** finish agreeing this plan, then execute TODO step 1 — write the
  docs and ADRs (the show-stopper) and review them **before** any code.
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
| Framework | **NestJS + TypeScript** | Scope grew (auth/vault, adapters, repos, CI); DI/guards/pipes/filters remove hand-wiring. ADR 0002 records the Express→NestJS switch and compares Express & Fastify |
| Persistence | PostgreSQL | Relational data (posts, threaded replies), integrity, idempotent-sync uniqueness. **ADR 0003 discusses alternatives: MySQL, MongoDB, key-value stores** |
| ORM | Prisma | Type-safe client, schema doubles as docs; hidden behind a repository interface |
| Data access | Repository pattern | Decouple service from Prisma; enables in-memory impl for fast tests |
| Platform support | Adapter/Strategy | System supports multiple platforms; ADR weighs the abstraction cost vs. flexibility |
| **First real platform** | **Facebook (Graph API)** | Fully implemented; Twitter/X, Instagram, LinkedIn stubbed |
| **Auth** | **OAuth2 bearer token + auth abstraction** | Real `Authorization: Bearer <token>` calls; `TokenProvider` abstraction per platform |
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
             -> HttpClient (token)  -> fetch/undici impl | mock (tests)
             -> TokenProvider (token) -> vault/env impl | static (tests)
```

Module layout: `AppModule` composes `CommentsModule` (controllers + service +
repository provider), `PlatformsModule` (adapter registry + adapters),
`AuthModule` (`TokenProvider` + `SecretStore`), and a shared `HttpModule`.

Key abstractions (all Nest providers, bound via injection tokens so tests swap
implementations through the testing module):

- **`CommentRepository`** decouples the service from Prisma; tests use an
  in-memory implementation with no database.
- **`PlatformAdapter`** (Adapter/Strategy) isolates per-platform API differences
  behind one contract, selected at runtime by a registry.
- **`TokenProvider`** (authentication abstraction) supplies an OAuth2 bearer
  token per platform. The production impl sources tokens from a vault-backed
  `SecretStore` (extendable to a refresh-token flow); tests use a static provider.
- **`HttpClient`** is the seam for outbound HTTP so the real adapter makes genuine
  Graph API calls in production while tests mock the boundary.

## Data model (`prisma/schema.prisma`)

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
- A `TokenProvider` interface abstracts token acquisition per platform, with
  swappable backends selected by environment (a small factory keyed on
  `TOKEN_SOURCE`):
  - **Production (`vault`):** fetch the integration token from a secret vault
    (e.g. HashiCorp Vault / cloud secret manager) via a `SecretStore` interface.
    Tokens are read at runtime, never persisted to disk or logs, and cached
    in-memory with a TTL. Designed so a refresh-token/exchange flow can be added
    without touching adapters.
  - **Local development (`env`/`provisioning`):** use a locally-provisioned
    token supplied via env (`.env`, git-ignored) — no vault dependency for
    day-to-day dev.
  - **Tests:** a static token provider returns a fixed value; no real OAuth.
- The prod-vs-local switch is a single seam (`SecretStore` behind the
  `TokenProvider` factory) so swapping backends needs no adapter/service changes.
- No secrets are hardcoded; tokens come from the vault (prod) or env (local) only.
- Full OAuth *authorization-code login UI* is out of scope for this iteration
  (we assume a pre-issued/provisioned access token), documented as a non-goal.
- **ADR 0009** records the decision to store integration tokens in a vault, the
  prod/local provider switch, and alternatives considered (env-only, encrypted
  file, cloud secret manager).

## REST API (`/api/v1`)

- `GET /posts/:postId/comments?limit&cursor` — retrieve comments for a published
  post. Cursor-paginated, oldest-first. `404` if post missing/unpublished.
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
  `istanbul ignore` on genuinely untestable lines (e.g. `server.ts` bootstrap),
  documented where used.

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
  auth/auth.module.ts              wires TokenProvider + SecretStore providers
  auth/token-provider.ts           TokenProvider interface + factory (vault/env/static)
  auth/secret-store.ts             SecretStore interface (vault vs local switch)
  auth/vault-secret-store.ts       production vault-backed impl
  auth/env-secret-store.ts         local/provisioning env-backed impl
  http-client/http-client.ts       HttpClient interface + fetch/undici impl
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
  adrs/0007-authenticate-with-oauth2-bearer-token.md
  adrs/0008-testing-and-ci-strategy.md
  adrs/0009-store-integration-tokens-in-vault.md
```

ADRs use the Nygard format (Status / Context / Decision / Consequences). They are
authored with **`Status: Proposed`** and only move to **`Status: Accepted`** once
agreed during implementation (a superseded decision gets a new ADR referencing the
old one). Each lists the alternatives considered and why the proposed option fits.

- **0002 NestJS** — records the Express→NestJS switch: as scope grew (auth/vault,
  adapters, repositories, CI), Nest's DI, guards, pipes, and exception filters
  earn their weight over hand-wired Express; compares Express and Fastify.
- **0003 PostgreSQL** — why a relational store fits posts + threaded replies +
  idempotent-sync uniqueness, discussing MySQL, MongoDB, and key-value stores.
- **0005 Repository pattern** and **0006 Adapter/Strategy** — the two explicitly
  requested, each with alternatives.
- Plus **0007 Authentication**, **0008 Testing & CI**, and **0009 Vault token
  storage** (with the prod/local provider switch).

## Documentation deliverables

- `docs/README.md`: architecture overview, folder structure, data model, API
  reference, auth setup (vault vs local token provisioning), how to run
  locally/Docker, how to run tests & CI, and how to run the live smoke test
  (`npm run smoke -- --token … --post-id … [--cleanup=false]`).
- `docs/adding-a-platform.md`: a concrete guide to adding a new social-network
  adapter — implement `PlatformAdapter`, wire a `TokenProvider`, register it,
  extend the `Platform` enum, add tests — with a checklist.
- ADRs in `docs/adrs/` documenting the major design decisions.
- Root `README.md`: project overview with a short pointer to `docs/`.

## Implementation TODO (ordered)

> **Docs first — show-stopper.** Step 1 (docs + ADRs) must be written and agreed
> before any implementation begins. If the design docs surface an unresolved
> decision, we stop and resolve it rather than coding around it.

1. **Docs & ADRs (BLOCKER):** `docs/README.md`, `docs/adding-a-platform.md`, and
   the 9 ADRs. Nothing below starts until these are reviewed and agreed.
2. Project scaffold: `package.json`, `tsconfig.json`, `nest-cli.json`,
   `jest.config.js` (coverage thresholds), `.env.example`, `docker-compose.yml`.
3. Prisma schema + initial migration.
4. Domain types + typed errors.
5. Auth module: `TokenProvider` factory + `SecretStore` (vault/env switch) and
   `HttpClient` seam.
6. Platforms module: `PlatformAdapter` interface + registry, Facebook adapter, stubs.
7. Repository layer: interface + injection token, Prisma impl, in-memory impl.
8. Comments module: service (use cases) + controller + DTOs/validation.
9. Common: exception filter (error envelope) + Nest bootstrap (`main.ts`).
10. Tests: unit, integration (Docker Postgres), e2e — meet 95%+ coverage.
11. Live smoke test app (`scripts/live-smoke`) with token param + cleanup.
12. CI workflow `.github/workflows/ci.yml`.
13. Verify locally (install, generate, migrate, test, dev curl) then finalize.

Progress will be tracked in the session task list mirroring these steps.

## Future tasks (backlog / out of current scope)

Explicitly deferred; captured so the extension path is clear and reviewers see
what a production build would add next:

- **Remaining platform adapters:** implement Twitter/X, Instagram, LinkedIn
  (currently `NotImplemented` stubs).
- **Full OAuth2 flow:** authorization-code login + token refresh/exchange, rather
  than a pre-issued bearer token.
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
- OAuth authorization-code login UI / token issuance is out of scope; we assume a
  pre-issued bearer token supplied via config.
- Security scanning, image publishing, and deployment are out of CI scope (noted).
- Only Facebook is fully implemented; other platform adapters are intentionally
  stubbed to show the extension point without over-building.
```
