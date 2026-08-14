# 2. Use NestJS for the REST API

## Status

Proposed

## Context

The system exposes comment retrieval and replies over a REST API. The scope has
grown well beyond a couple of endpoints: it now includes a platform
Adapter/Strategy layer with a registry, an authentication layer (`TokenProvider`
plus a vault/env `SecretStore`), an outbound `HttpClient` seam, a repository
abstraction with two implementations, real-database integration tests, and CI.
That is a lot of collaborating components that must be wired together, configured,
and independently testable.

An earlier iteration proposed **Express + TypeScript** precisely because it is
thin and keeps the framework out of the way. That reasoning held while the scope
was small. As the component count and cross-cutting concerns (authentication,
validation, consistent error mapping) grew, the amount of hand-rolled wiring
(manual dependency injection, ad-hoc validation, bespoke error middleware) became
a liability: more of our own plumbing to write, test, and keep at the required
coverage bar.

Options considered:

- **NestJS** — an opinionated framework with a first-class dependency-injection
  container, modules for encapsulation, guards (a natural home for
  authentication), pipes (validation), and exception filters (a single place to
  produce our error envelope). The adapter registry and `TokenProvider` map
  cleanly onto providers bound via injection tokens, which also makes swapping
  implementations in tests straightforward.
- **Express + TypeScript** — minimal and unopinionated. Maximum control and
  minimum framework surface, but we implement DI, validation wiring, and error
  handling ourselves. Best when the app is small; less so as it grows.
- **Fastify + TypeScript** — lightweight and fast with first-class schema
  validation and a plugin-based encapsulation model. A reasonable middle ground,
  but it offers less structural guidance (notably DI) than Nest for a system with
  this many collaborating parts.

## Decision

We use **NestJS with TypeScript**, superseding the earlier Express proposal.

- Feature modules (`CommentsModule`, `PlatformsModule`, `AuthModule`, a shared
  HTTP module) provide encapsulation and clear boundaries.
- Nest's DI container wires providers; abstractions (`CommentRepository`,
  `PlatformAdapter`, `TokenProvider`, `HttpClient`) are bound via injection tokens
  so tests substitute in-memory/mock implementations through the testing module.
- Guards, pipes, and an exception filter handle authentication, validation, and
  the consistent error envelope respectively, rather than bespoke middleware.

## Consequences

- Less hand-written wiring; cross-cutting concerns have idiomatic, well-tested
  homes, which also helps meet the coverage bar (we test our logic, not plumbing).
- The framework becomes part of what the codebase demonstrates — a reasonable
  trade now that the design is expressed through Nest's building blocks.
- Higher baseline complexity than Express/Fastify: decorators, modules, and DI
  metadata are concepts a reader must know. Accepted given the scope.
- This ADR supersedes the earlier Express proposal; if scope were ever to shrink
  drastically, revisiting a thinner framework would warrant a new ADR.
