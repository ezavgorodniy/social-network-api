# 10. Use native `fetch` for outbound HTTP, behind the HttpClient seam

## Status

Accepted

## Context

The Facebook adapter (and future platform adapters) must make outbound HTTP calls
to the platform's API. We need to choose how those calls are made. As with the ORM
(see [ADR 4](0004-use-prisma-as-orm.md)), the choice is contained behind a seam: the
`HttpClient` interface. Adapters depend on `HttpClient`, never on a concrete HTTP
library, so this is a low-stakes, swappable decision.

Options considered:

- **Native global `fetch`** — built into Node.js 18+ (our runtime is Node 20). Zero
  dependencies, a standard WHATWG API familiar from the browser. Under the hood it
  *is* undici, so we get its performance without taking a direct dependency. No
  connection-pool tuning or interceptors, but we do not need those yet.
- **`undici` (the library)** — the same engine as native `fetch`, exposed directly.
  Adds `MockAgent` for wire-level mocking and low-level `Client`/`Pool` control, and
  decouples the HTTP version from the Node runtime. The cost is an extra dependency.
- **`axios`** — ergonomic, interceptors, very widely used, but heavier and brings its
  own request/response model that would sit behind our interface anyway.
- **`got`** — batteries-included (retries, hooks), but more than this iteration needs
  and another dependency to carry.

A decisive point specific to our design: per
[ADR 8](0008-testing-and-ci-strategy.md), tests **mock at the `HttpClient` boundary**,
not at the wire. So undici's headline advantage — `MockAgent` — is largely redundant
here; we never need to intercept real socket traffic in tests. That removes the main
reason we would otherwise reach for undici directly.

## Decision

We use **Node's native `fetch`** as the real `HttpClient` implementation, behind the
`HttpClient` interface. No HTTP client library is added as a dependency this
iteration.

- Adapters depend only on `HttpClient`; the `fetch`-based implementation lives in one
  file.
- Tests provide a mock `HttpClient` (they do not exercise `fetch` itself), consistent
  with ADR 8.
- If we later need connection pooling, retries with backoff, circuit breaking, or
  interceptors (see the future-tasks backlog), we introduce the relevant library
  (likely `undici`) as a new `HttpClient` implementation and switch the binding —
  recorded as a superseding ADR — without touching adapters or the service.

## Consequences

- Zero added dependencies for outbound HTTP; smaller install and less to maintain or
  patch.
- The standard `fetch` API is widely understood and needs no wrapper knowledge.
- We forgo built-in retries/pooling/interceptors for now; that capability is deferred
  and, when needed, slots in behind the existing seam.
- Because tests mock `HttpClient`, giving up undici's `MockAgent` costs us nothing in
  test fidelity.
- The `HttpClient` interface must expose only what our adapters need (method, URL,
  headers, body, and a typed response), keeping it easy to reimplement on a different
  client later.
