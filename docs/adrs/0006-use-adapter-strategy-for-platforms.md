# 6. Use the Adapter/Strategy pattern for multiple platforms

## Status

Proposed

## Context

The system supports multiple social platforms and must retrieve comments and post
replies across them. Each platform (Facebook, Twitter/X, Instagram, LinkedIn)
exposes a different API shape, authentication scheme, and comment/reply model.
Those differences must be normalised somewhere so the rest of the system can work
in platform-agnostic domain terms.

Options considered:

- **Adapter/Strategy** — define a `PlatformAdapter` interface (`fetchComments`,
  `postReply`) with one implementation per platform, selected at runtime by a
  registry keyed on the platform. Platform differences are isolated behind a
  stable contract; the service stays platform-agnostic.
- **Single unified model with inline branching** — one code path with
  `switch (platform)` statements wherever behaviour differs. Simplest for one
  platform, but platform-specific logic leaks across the codebase and every new
  platform means editing many call sites.
- **A plain lookup map / discriminated union** — a lighter expression of the same
  idea (see the note below). Fine for a small, fixed set of platforms; offers less
  structure than a registry as the set and its lifecycle grow.

## Decision

We use the **Adapter/Strategy pattern**. The `CommentService` resolves the correct
adapter from a `PlatformAdapterRegistry` and calls the interface methods, never
knowing which platform it is talking to. **Facebook** is fully implemented against
the real Graph API; the remaining platforms are registered as explicit
`NotImplementedAdapter` stubs that fail loudly, marking the extension point.

We acknowledge that for a system talking to a single platform today this is
arguably more structure than strictly required. We adopt it deliberately because
the system's requirement is explicitly *multi-platform*, so the abstraction
reflects a real, stated need rather than speculative future-proofing, and it keeps
"add a platform" a matter of writing one new adapter.

## Idiomatic in NestJS / TypeScript

This pattern is broadly idiomatic across languages, and a reader from C# or Go
will recognise it immediately — it is essentially a C# `IPlatformAdapter` +
factory/DI, or a Go `PlatformAdapter interface` + map. In the Node/TypeScript
world it is uncontroversial, with two flavour notes:

- **Lighter alternative:** for a small, fixed number of platforms, many TS
  developers would use a plain `Record<Platform, PlatformAdapter>` map or a
  discriminated union + `switch` rather than a formal registry class. That is a
  legitimate, lighter choice; we prefer the registry because it composes naturally
  with NestJS DI (adapters are providers) and gives a single place to manage
  adapter lookup and the not-implemented behaviour.
- **The same TypeScript wrinkle as the repository:** interfaces are erased at
  runtime, so adapters are provided/collected via NestJS DI using tokens rather
  than by interface type. This mirrors the injection-token approach described in
  [ADR 5](0005-use-repository-pattern.md).

## Consequences

- Adding a platform means implementing one `PlatformAdapter` and registering it;
  no changes to the service or HTTP layers.
- Platform-specific quirks stay isolated and independently testable (each adapter
  can be unit-tested against a mocked `HttpClient`).
- Unimplemented platforms fail with a clear, typed error (surfaced as HTTP 501)
  rather than silently misbehaving.
- The interface + registry indirection is more structure than a single-platform
  system strictly needs — an accepted trade-off for the stated multi-platform
  requirement.
