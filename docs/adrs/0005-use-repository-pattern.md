# 5. Use the Repository pattern for data access

## Status

Accepted

> Amended by [ADR 14](0014-read-through-pagination.md): under read-through
> pagination the platform owns paging, so the `CommentRepository` carries no
> cursor logic and the two implementations mirror ordering and idempotent upsert
> but *not* a cursor scheme.

## Context

The service layer needs to read and persist posts and comments. The naive
approach is to let the service call the ORM (Prisma) directly. That couples our
business logic to a specific database technology and makes the service hard to
test without a running database — every unit test would need either a real
PostgreSQL or an intricate mock of the Prisma client.

We want:

- Business logic that does not depend on the persistence technology.
- Fast, deterministic unit and e2e tests that run without a database.
- The freedom to change or swap the ORM later (see
  [ADR 4](0004-use-prisma-as-orm.md)) without rewriting the service.

Options considered:

- **Repository pattern** — define a `CommentRepository` interface expressed in
  domain terms; provide a production implementation backed by Prisma and an
  in-memory implementation for tests. The service depends only on the interface.
- **Service calls the ORM directly** — least indirection and fewest files, but
  couples business logic to Prisma and forces database-backed or heavily-mocked
  tests. Mocking a fluent ORM client is brittle and tests the mock, not behaviour.
- **Generic/abstract repository via the ORM** — some ORMs offer a generic
  repository. It still leaks ORM types and query semantics into the service and
  does not give us a database-free test double as cleanly as a hand-rolled
  interface.

## Decision

We use the **Repository pattern**. A `CommentRepository` interface, expressed in
domain types, is the only data-access contract the service knows about. It is
bound in NestJS via an injection token, with two implementations:

- `PrismaCommentRepository` — production, maps Prisma rows to domain types.
- `InMemoryCommentRepository` — used by unit and e2e tests, mirroring the Prisma
  implementation's observable semantics (ordering, cursor pagination, idempotent
  upsert on `(platform, externalId)`).

Tests wire the service to the in-memory implementation through Nest's testing
module, exercising real business logic with no database and no ORM mocking.

## Idiomatic in NestJS / TypeScript

Coming from C# or Go, this pattern will feel familiar — and it maps over almost
1:1 — but its standing in the Node/TypeScript world is worth noting:

- The lightweight Express crowd often skips repositories and calls the ORM
  directly, viewing the pattern as "enterprise ceremony." The NestJS/enterprise-TS
  crowd (where this project sits) treats a domain-specific repository interface as
  normal and expected — Nest is deliberately modeled on Angular/Spring (DI,
  providers, interfaces), so this is idiomatic here.
- **Counterargument to acknowledge:** Prisma's own docs note that Prisma is
  already a data-mapper/repository, so wrapping it can be redundant. That critique
  targets *thin passthrough* repositories. Ours earns its place specifically
  because it provides the database-free in-memory test double and the
  swappable-ORM seam (see [ADR 4](0004-use-prisma-as-orm.md)) — not indirection
  for its own sake. We deliberately keep it a domain-specific interface, not a
  generic `IRepository<T>`.
- **One TypeScript wrinkle:** interfaces are erased at runtime, so — unlike C#'s
  `AddScoped<IRepo, Repo>()` or Go's implicit interface satisfaction — Nest cannot
  inject by interface type alone. We bind the implementation with an explicit
  injection token (a `Symbol`/string) and `@Inject(...)`. This is a standard Nest
  idiom; it is the main spot where a C#/Go mental model needs a small adjustment.

## Consequences

- The service and its unit/e2e tests are fully decoupled from Prisma and from
  PostgreSQL; those tests run anywhere with no external dependencies.
- The ORM decision is cheap to revisit: swapping Prisma for a lighter option means
  adding one repository implementation, not touching the service.
- We must keep the two implementations' semantics aligned. To contain this cost, a
  shared contract test suite can run the same behavioural assertions against both
  implementations (the Prisma one against the real database in integration tests).
- A little more indirection and a few more files than calling the ORM directly —
  an accepted trade for testability and decoupling.
