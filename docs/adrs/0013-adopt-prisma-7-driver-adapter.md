# 13. Adopt the Prisma 7 driver-adapter model (amends ADR 4)

## Status

Accepted

## Context

[ADR 4](0004-use-prisma-as-orm.md) chose Prisma as the ORM, behind a
`CommentRepository` interface. That ADR was written during the docs-first phase
and described Prisma *generically*, based on the long-standing Prisma model: a
schema that carries the datasource `url`, and a separate native (Rust) query-engine
binary at runtime. Its "Consequences" explicitly accepted "Prisma's heavier
footprint (query-engine binary, codegen step)".

At implementation time — pinning the current stable line per the version policy —
this turned out to be **Prisma 7**, which changes the model in ways ADR 4 could not
have anticipated:

- **P1012 on `prisma validate`.** Prisma 7 no longer allows `url` in the
  `datasource` block of `schema.prisma`, and no longer auto-loads `.env`. The error
  is explicit: *"The datasource property 'url' is no longer supported in schema
  files. Move connection URLs to prisma.config.ts and pass either 'adapter' or
  'accelerateUrl' to PrismaClient."*
- **Driver adapters replace the native query engine.** Prisma 7 talks to the
  database through a driver adapter (for PostgreSQL, `@prisma/adapter-pg`, backed by
  the `pg` client) plus a WASM query compiler, instead of shipping a separate
  native query-engine binary.

So the "heavy footprint = query-engine binary" premise in ADR 4 is no longer
accurate, and the connection-configuration mechanics it implied have moved. This is
new information learned at implementation time, not an error in ADR 4's reasoning,
so we record it here rather than editing an accepted ADR (per [ADR 1](0001-record-architecture-decisions.md),
accepted ADRs are immutable).

### On "amends" vs "supersedes"

ADR 1's process only names *supersede*, which implies reversing a decision. We are
**not** reversing ADR 4 — we still use Prisma, still behind `CommentRepository`. We
are refining *how* that decision is realised under Prisma 7. We therefore introduce
a lighter relationship, **amends**: ADR 4 stands; this ADR updates its mechanics and
corrects one now-false consequence. ADR 4 gets a forward-reference note pointing
here; its decision text is left intact.

## Decision

We adopt the Prisma 7 driver-adapter model:

- **Connection config lives in `prisma.config.ts`, not `schema.prisma`.**
  `schema.prisma`'s datasource holds only `provider = "postgresql"`. `prisma.config.ts`
  explicitly loads `.env` (Prisma 7 dropped built-in dotenv) and supplies
  `DATABASE_URL` to the datasource for CLI commands (migrate / introspect / studio).
- **The runtime uses a driver adapter.** `PrismaCommentRepository` constructs
  `PrismaClient` with `@prisma/adapter-pg` (backed by `pg`). The application runtime
  does not read `prisma.config.ts`; that config is for the Prisma CLI only.
- **New runtime dependencies:** `@prisma/adapter-pg` and `pg` (with `@types/pg` for
  development).

This amends ADR 4. ADR 4's core decision — Prisma behind `CommentRepository`, with a
`PrismaCommentRepository` and an `InMemoryCommentRepository` — is unchanged.

## Consequences

- ADR 4's consequence "we accept Prisma's heavier footprint (query-engine binary)"
  is corrected: there is **no** native query-engine binary under Prisma 7. The
  runtime is a normal Node Postgres driver (`pg`), which is lighter and friendlier
  to slim/serverless images. The `prisma generate` codegen step remains.
- Connection configuration is split across two places by design: `schema.prisma`
  (provider + models) and `prisma.config.ts` (the `.env`-sourced `DATABASE_URL` for
  CLI use). Contributors must know that editing the connection string means editing
  `prisma.config.ts` / `.env`, not the schema.
- The driver-adapter wiring is contained inside `PrismaCommentRepository`, so it does
  not leak past the `CommentRepository` seam; the service, controllers, and tests are
  unaffected, exactly as ADR 4 intended.
- We adopt "amends" as a lighter alternative to "supersedes" in our ADR process, for
  cases where new information refines an accepted decision without reversing it.
