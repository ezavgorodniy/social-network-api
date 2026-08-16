# 12. Target Node.js 22 (Active LTS)

## Status

Accepted

## Context

The project needs a target Node.js runtime, which fixes `engines.node`, the
`@types/node` line, and the TypeScript `target`/`lib`. The choice should favour a
supported, stable runtime over the newest release.

Options considered:

- **Node 22 (Active LTS) — chosen.** The current Active LTS line, with long-term
  support and security patches, and native global `fetch` (which we rely on — see
  [ADR 10](0010-use-native-fetch-for-outbound-http.md)). Matches the local
  development runtime.
- **Node 20 (Maintenance LTS).** Still supported and also has global `fetch`, but is
  older and closer to end-of-life than 22; no reason to target it for a greenfield
  project.
- **Node 24 / latest `current`.** Newer features, but not the Active LTS baseline for
  a service we want to run on a stable, widely-supported runtime.

## Decision

We target **Node.js 22 (Active LTS)**:

- `engines.node` is set to `>=22`.
- `@types/node` is pinned to the **`^22`** line so the type definitions match the
  runtime rather than advertising APIs a newer Node exposes (the `@types/node`
  `latest` tag tracks the newest Node, not the LTS we run).
- The TypeScript compiler `target`/`lib` is set to **`ES2023`**, which Node 22
  supports natively (see [ADR 11](0011-pin-typescript-5x.md)).
- CI runs on Node 22 so the pipeline matches production and local development.

## Consequences

- We run on a supported LTS with security patches, and can use native `fetch` without
  a polyfill or extra dependency.
- Pinning `@types/node` to `^22` keeps compile-time API surface honest — code cannot
  accidentally rely on APIs newer than the runtime provides.
- We forgo the newest Node features until the next LTS; an accepted trade for
  stability. Moving to a later LTS later is a small, contained change recorded as a
  superseding ADR.
