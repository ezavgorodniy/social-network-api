# 4. Use Prisma as the ORM, behind a repository interface

## Status

Accepted

> Amended by [ADR 13](0013-adopt-prisma-7-driver-adapter.md): Prisma 7 uses a
> driver adapter (`@prisma/adapter-pg`) instead of a native query-engine binary,
> and connection config moves from `schema.prisma` to `prisma.config.ts`.

## Context

We need to talk to PostgreSQL (see
[ADR 3](0003-use-postgresql-for-persistence.md)) from TypeScript. We want type
safety, a readable schema, first-class migrations, and — importantly — the
ability to unit test the service layer without a running database. Options
considered:

- **Prisma** — a declarative schema file that doubles as documentation, a fully
  type-safe generated client, first-class migrations, and clean support for
  relations (including the self-relation we use for reply threads). Strong
  developer experience, and the schema neatly serves as the "database schema"
  deliverable. **Cost:** it is not especially lightweight — the default engine is
  a separate (Rust) query engine binary, and it requires a `prisma generate`
  codegen step in the build. That means a larger install and an extra build
  artifact (which can be awkward in slim/serverless environments).
- **Drizzle ORM** — the standout *lightweight* alternative: TypeScript-native,
  **no code generation**, no query-engine binary, a tiny runtime, and strong
  type inference over a SQL-like query builder. Schema is defined in TS;
  migrations via `drizzle-kit`. Integrates well with Nest. Trade-off: a younger
  ecosystem and a more SQL-forward, less "magic" model than Prisma.
- **Kysely** — a pure, type-safe SQL query builder (not really an ORM) with
  near-zero runtime overhead. The lightest option, but the least
  batteries-included: we would own migrations and row-to-domain mapping ourselves.
- **TypeORM** — decorator-based entities that live on the model classes. Capable
  and popular in the Nest ecosystem, but the decorators couple the domain model
  to the ORM, its type inference is weaker than Prisma's, and it is heavier, not
  lighter.
- **Knex / raw SQL** — maximum control, but hand-written mapping and no generated
  types; more boilerplate and more room for error at this scope.

Note that Nest is often paired with TypeORM, but Nest is ORM-agnostic and Prisma
integrates cleanly as an injectable provider, so choosing Prisma costs us nothing
in framework fit.

**Crucially, the repository abstraction makes this a cheap, swappable decision.**
The service depends only on the `CommentRepository` interface; the ORM lives
entirely inside `PrismaCommentRepository`. If Prisma's footprint (engine binary,
codegen step, slim-image friction) ever becomes a problem, we can add, say, a
`DrizzleCommentRepository` and switch the bound implementation without touching
the service, controllers, or tests. So "is Prisma light enough?" is a low-stakes
question here — the weight is contained behind one seam.

## Decision

We use **Prisma**, but the service layer never imports it. Instead the service
depends on a `CommentRepository` interface (bound via a Nest injection token).
Two implementations exist:

- `PrismaCommentRepository` — production; maps Prisma rows to domain types.
- `InMemoryCommentRepository` — used by unit and e2e tests (and viable for local
  exploration), mirroring the Prisma implementation's semantics.

This dependency inversion (detailed in the repository-pattern ADR) means we test
real business logic against the in-memory implementation without mocking Prisma.

## Consequences

- Type-safe database access and a schema file that serves as living documentation
  and satisfies the schema deliverable.
- The service and its unit/e2e tests have zero dependency on a database, so those
  tests run with no PostgreSQL instance; the Prisma implementation itself is
  exercised by integration tests against a real database.
- We maintain two repository implementations and must keep their semantics aligned
  (ordering, pagination, idempotency). This is a deliberate, contained cost that
  buys fast, deterministic tests.
- We accept Prisma's heavier footprint (query-engine binary, codegen step) as a
  low-risk choice because it is isolated behind `CommentRepository`; swapping to a
  lighter option (e.g. Drizzle) later means adding one implementation, not a
  rewrite. Such a swap would be recorded as a superseding ADR.
