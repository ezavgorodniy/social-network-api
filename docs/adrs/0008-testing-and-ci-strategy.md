# 8. Testing and CI strategy

## Status

Accepted

## Context

The system has three layers that fail in different ways and need different kinds
of test:

- **Business logic** (`CommentService`) — orchestration, validation, not-found and
  not-implemented paths. Should be tested fast, deterministically, and without any
  external dependency.
- **Persistence** (`PrismaCommentRepository`) — schema, relations, cursor
  pagination, and the idempotent upsert on `(platform, externalId)`. A mocked
  Prisma client would test the mock, not the database; this layer is only
  meaningfully tested against a **real PostgreSQL**.
- **HTTP contract** (controllers, validation pipe, exception filter) — status
  codes and response/error envelopes. Tested end-to-end through the assembled Nest
  application.

We also make **real outbound calls** to the Facebook Graph API in production
(see [ADR 6](0006-use-adapter-strategy-for-platforms.md) and
[ADR 7](0007-authenticate-with-oauth2-bearer-token.md)). We deliberately do **not**
call the live platform from automated tests: it needs a real token, is
non-deterministic, has rate limits, and mutates real accounts. The `HttpClient`
seam exists precisely so tests mock that boundary while production uses real HTTP.

The requirement is a **high coverage bar (95% minimum, target 100%)** enforced in
CI, and a CI pipeline that exercises real database behaviour rather than mocking
it away.

Options considered for the database layer:

- **Real PostgreSQL in Docker (chosen)** — a service container in CI and
  `docker-compose` locally; migrations applied first, then integration tests run
  against it. Highest fidelity; catches schema/constraint/SQL issues.
- **In-memory SQLite / pg-mem** — faster and dependency-free, but a different SQL
  dialect and constraint behaviour than Postgres, so it can pass while real
  Postgres fails (defeating the point of the integration layer).
- **Mock the Prisma client** — brittle, couples tests to query construction, and
  verifies the mock rather than real persistence.

## Decision

We use a **three-tier test strategy** plus a manual live smoke test, with a
coverage gate enforced in CI.

- **Unit tests** — `CommentService` against `InMemoryCommentRepository` and a fake
  adapter; the Facebook adapter against a mocked `HttpClient` and a static
  `TokenProvider`. No database, no network. Covers retrieval, pagination, reply,
  validation, not-found, not-implemented, and upstream-error paths.
- **Integration tests** — `PrismaCommentRepository` against a **real PostgreSQL in
  Docker**, migrations applied first. Verifies schema, relations, ordering, cursor
  pagination, and idempotent upserts for real.
- **E2E tests** — `supertest` against the Nest application built from a testing
  module (in-memory repo + mocked adapter), asserting HTTP status codes and
  response/error envelope shapes.
- **Coverage gate** — Jest `coverageThreshold` set to **95%** across statements,
  branches, functions, and lines. We aim for 100% and fall back to targeted
  `istanbul ignore` only on genuinely untestable lines (e.g. the `main.ts`
  bootstrap), documented where used.
- **Live smoke test** (see PLAN) — a standalone Node application, run manually with
  a real token, that hits the real Graph API and cleans up after itself. **Never
  runs in CI.**

CI (GitHub Actions) on push/PR: checkout → setup Node → `npm ci` → type-check
(`tsc --noEmit`) → start **PostgreSQL as a service container** and
`prisma migrate deploy` → run unit + integration + e2e tests **with coverage**,
enforcing the 95% gate.

**Out of CI scope (noted as placeholders):** security scanning (SAST/dependency
scanning), container image build/publish, and deployment — deferred to future
tasks.

## Consequences

- Fast feedback for the bulk of the suite (unit + e2e need no database), while the
  persistence layer is verified against a real engine, so dialect/constraint bugs
  surface in CI rather than production.
- The `HttpClient` and `TokenProvider` seams keep the platform boundary mockable;
  the only real-platform exercise is the manual smoke test, kept out of CI.
- Maintaining `InMemoryCommentRepository` in step with the Prisma implementation is
  an ongoing cost; a shared contract test suite (run against both) contains it —
  see [ADR 5](0005-use-repository-pattern.md).
- The 95% gate can occasionally force tests for low-value branches; the targeted,
  documented `istanbul ignore` escape hatch keeps that pragmatic rather than
  dogmatic.
- CI needs Docker/service-container support and pays the cost of spinning up
  Postgres and applying migrations on every run — an accepted trade for fidelity.
