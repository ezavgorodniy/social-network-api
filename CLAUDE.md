# Project: Multi-Platform Comment System

A NestJS + TypeScript REST API for retrieving and replying to comments on published
social-media posts across multiple platforms. Facebook (Graph API) is fully
implemented; other platforms are stubbed.

- **Planning:** `docs/PLAN.md` (living document, deleted once implemented).
- **Design decisions:** ADRs under `docs/adrs/` (Nygard format).
- **Architecture & folder guide:** `docs/README.md`.
- **Adding a platform:** `docs/adding-a-platform.md`.

## Stack

- Runtime: Node.js + TypeScript (strict mode).
- Framework: NestJS (DI, modules, providers, guards, pipes, exception filters).
- Persistence: PostgreSQL via Prisma, behind a `CommentRepository` interface.
- Validation: `zod` at the HTTP boundary.
- Tests: Jest (unit + integration + e2e), `supertest` for e2e, Docker Postgres for
  integration. 95% coverage minimum (target 100%).

## TypeScript conventions

- `tsc --noEmit` and tests must pass before anything is considered done.
- `strict: true`; do not use `any` — prefer precise types, `unknown` at boundaries.
- Always add explicit type annotations on public/exported functions and providers.
- Prefer verbose, descriptive names over abbreviations.
- No non-null assertions (`!`) to silence the compiler; narrow types properly.
- Interfaces are erased at runtime — inject implementations via Nest injection
  tokens (`Symbol`/string) + `@Inject(...)`, not by interface type.

## NestJS / Node.js conventions

- Depend on interfaces (injection tokens), not concrete classes, at every seam:
  `CommentRepository`, `PlatformAdapter`, `TokenProvider`, `HttpClient`.
- Keep the service layer free of Prisma and framework HTTP types; map to domain
  types in the repository/adapter.
- Errors: throw typed domain errors; the exception filter maps them to the shared
  envelope `{ "error": { "code", "message" } }`. No silent failures or catch-all
  handlers that swallow errors.
- Configuration and secrets come from the environment only — never hardcode.
- **Never log or persist the platform token** (`X-Platform-Token`). The API is
  HTTPS/TLS only (see ADR 7).
- Prefer async/await; no floating promises.

## Documentation conventions

- ADRs use the Nygard format (Status / Context / Decision / Consequences), authored
  as `Status: Proposed` and moved to `Status: Accepted` only once agreed. ADRs are
  immutable once accepted; supersede rather than rewrite. **One ADR per commit.**
- Comments explain the *why*, not the *what*. Default to no comment unless the
  reason is non-obvious.
- Keep `docs/README.md` and the ADR links accurate when behaviour changes.

## Workflow

- Docs & ADRs come first and are a blocker before implementation (see PLAN.md).
- Agree the approach before building; do not jump into implementation.
