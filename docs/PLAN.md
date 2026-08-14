# Implementation Plan: Multi-Platform Comment System

## Context

The README (`README.md`) is a take-home brief: design and **partially implement**
a comment system for a social-media scheduling API that supports multiple
platforms. Required capabilities:

- Retrieve comments for a published post
- Reply to a comment
- Support multiple social platforms
- Expose functionality through a REST API

Requested deliverables: database schema, API design, relevant TypeScript code,
and an explanation of major design decisions.

The repo is currently greenfield (`README.md` + `.gitignore`). This plan builds a
**core vertical slice**: the two endpoints fully working, backed by
PostgreSQL/Prisma, with a platform **Adapter/Strategy** abstraction where one
adapter (**Facebook**) is fully implemented against the real Graph API and the
rest are explicit stubs. Design decisions are captured as **ADRs**.

## Decisions to confirm

| Area | Choice | Rationale (full reasoning goes in an ADR) |
| --- | --- | --- |
| Framework | Express + TypeScript | Thin/unopinionated so the architecture is on display; ADR compares NestJS & Fastify |
| Persistence | PostgreSQL | Relational data (posts, threaded replies), integrity, idempotent-sync uniqueness |
| ORM | Prisma | Type-safe client, schema doubles as docs; hidden behind a repository interface |
| Data access | Repository pattern | Decouple service from Prisma; enables in-memory impl for fast tests |
| Platform support | Adapter/Strategy | Brief says "multiple platforms"; ADR acknowledges it's arguably over-engineering |
| **First real platform** | **Facebook (Graph API)** | Fully implemented; Twitter/X, Instagram, LinkedIn stubbed |
| **Auth** | **OAuth2 bearer token + auth abstraction** | Real `Authorization: Bearer <token>` calls; `TokenProvider` abstraction per platform |
| Scope | Core vertical slice | Two endpoints end-to-end, one real adapter, others stubbed |
| Tests | In-memory repo (unit) + real Postgres in Docker (integration) | See Testing & CI |
| **Coverage** | **95% minimum, target 100%** | Enforced via Jest coverage thresholds and in CI |

## Architecture

Layered with dependency inversion:

```
HTTP layer            (Express router, controllers, zod validation, error mapping)
   -> Service layer   (CommentService: business rules & orchestration)
      -> CommentRepository interface   -> Prisma impl | InMemory impl
      -> PlatformAdapter interface     -> Facebook adapter | NotImplemented stubs
             -> HttpClient interface   -> fetch-based impl | mock (tests)
             -> TokenProvider interface -> env/OAuth2 impl | static (tests)
```

Key abstractions:

- **`CommentRepository`** decouples the service from Prisma; tests use an
  in-memory implementation with no database.
- **`PlatformAdapter`** (Adapter/Strategy) isolates per-platform API differences
  behind one contract, selected at runtime by a registry.
- **`TokenProvider`** (authentication abstraction) supplies an OAuth2 bearer
  token per platform. The production impl sources tokens from env/secret store
  (extendable to a refresh-token flow); tests use a static provider.
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
- Full OAuth *authorization-code login UI* is out of scope for the take-home
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
- **E2E tests:** `supertest` against the assembled Express app (in-memory repo +
  mocked adapter) asserting HTTP status and response shapes.
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
prisma/schema.prisma
src/
  config/env.ts                    validated env loading
  domain/comment.ts                domain types
  domain/errors.ts                 typed errors -> HTTP status
  auth/token-provider.ts           TokenProvider interface + factory (vault/env/static)
  auth/secret-store.ts             SecretStore interface (vault vs local switch)
  auth/vault-secret-store.ts       production vault-backed impl
  auth/env-secret-store.ts         local/provisioning env-backed impl
  http-client/http-client.ts       HttpClient interface + fetch impl
  platforms/platform-adapter.ts    PlatformAdapter interface + registry
  platforms/facebook-adapter.ts    fully-implemented Graph API adapter (OAuth2 bearer)
  platforms/stubs.ts               NotImplemented adapters
  repositories/comment-repository.ts       interface
  repositories/prisma-comment-repository.ts
  repositories/in-memory-comment-repository.ts
  services/comment-service.ts      use cases
  http/comments.controller.ts
  http/router.ts
  http/validation.ts               zod schemas
  http/serializers.ts              domain -> JSON DTOs
  http/error-middleware.ts
  app.ts                           testable composition root
  composition.ts                   production wiring
  server.ts                        entry point
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
  adrs/0002-use-express-for-rest-api.md
  adrs/0003-use-postgresql-for-persistence.md
  adrs/0004-use-prisma-as-orm.md
  adrs/0005-use-repository-pattern.md
  adrs/0006-use-adapter-strategy-for-platforms.md
  adrs/0007-authenticate-with-oauth2-bearer-token.md
  adrs/0008-testing-and-ci-strategy.md
  adrs/0009-store-integration-tokens-in-vault.md
```

ADRs use the Nygard format (Status / Context / Decision / Consequences). Each
lists the alternatives considered and why the chosen option fits. Note the two
explicitly requested: **0005 Repository pattern** and **0006 Adapter/Strategy**,
plus **0007 Authentication**, **0008 Testing & CI**, and **0009 Vault token
storage** (with the prod/local provider switch).

## Documentation deliverables

- `docs/README.md`: architecture overview, folder structure, data model, API
  reference, auth setup (vault vs local token provisioning), how to run
  locally/Docker, how to run tests & CI, and how to run the live smoke test
  (`npm run smoke -- --token … --post-id … [--cleanup=false]`).
- `docs/adding-a-platform.md`: a concrete guide to adding a new social-network
  adapter — implement `PlatformAdapter`, wire a `TokenProvider`, register it,
  extend the `Platform` enum, add tests — with a checklist.
- ADRs in `docs/adrs/` for the design-decision explanation the brief requires.
- Root `README.md`: keep the brief; add a short pointer to `docs/`.

## Implementation TODO (ordered)

1. Project scaffold: `package.json`, `tsconfig.json`, `jest.config.js` (coverage
   thresholds), `.env.example`, `docker-compose.yml`.
2. Prisma schema + initial migration.
3. Domain types + typed errors.
4. Auth abstraction: `TokenProvider` factory + `SecretStore` (vault/env switch)
   and `HttpClient` seam.
5. Platform layer: `PlatformAdapter` interface + registry, Facebook adapter, stubs.
6. Repository layer: interface, Prisma impl, in-memory impl.
7. Service layer (`CommentService`).
8. HTTP layer: validation, serializers, controllers, router, error middleware.
9. Composition + server entry point.
10. Tests: unit, integration (Docker Postgres), e2e — meet 95%+ coverage.
11. Live smoke test app (`scripts/live-smoke`) with token param + cleanup.
12. Docs: `docs/README.md`, `docs/adding-a-platform.md`, 9 ADRs.
13. CI workflow `.github/workflows/ci.yml`.
14. Verify locally (install, generate, migrate, test, dev curl) then finalize.

Progress will be tracked in the session task list mirroring these steps.

## Verification

1. `docker compose up -d db` then `npm run prisma:migrate` (schema applies).
2. `npm test` — unit + integration + e2e green, coverage ≥ 95%.
3. `npm run dev` and hit both endpoints with curl (documented in `docs/README.md`).
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
