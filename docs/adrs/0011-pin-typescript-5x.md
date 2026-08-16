# 11. Pin TypeScript to the 5.x line (not the new native compiler)

## Status

Proposed

## Context

When scaffolding the project we pin build-tool versions. For most packages we take
the current latest, but TypeScript needs a deliberate decision because its `latest`
dist-tag has moved ahead of what our toolchain supports.

At the time of writing, `npm view typescript` reports:

- `latest`: **7.0.2**
- `beta`: `6.0.0-beta`
- latest 5.x: **5.9.3**

TypeScript **7.0** is the ground-up **native (Go) rewrite** of the compiler
("Corsa"/`tsgo`). It is a major architectural change, not just an incremental
release, and the surrounding ecosystem has not caught up:

- **`typescript-eslint@8` peer-caps TypeScript at `>=4.8.4 <6.1.0`.** Installing
  TypeScript 6 or 7 puts the linter outside its supported range, so `npm run lint`
  would break (or silently run unsupported).
- **NestJS 11 targets the TypeScript 5.x line.** Our stack is decorator- and
  metadata-heavy (`emitDecoratorMetadata`, `experimentalDecorators`, `reflect-metadata`,
  Nest DI, Prisma). The new compiler's behaviour with decorator metadata and
  `ts-jest`/`ts-node` transforms is not yet proven for this kind of codebase.
- We gain nothing functional from 6/7 for this project; the value is compile speed,
  which is irrelevant at this scope and not worth toolchain breakage.

Options considered:

- **Pin to latest 5.x (`^5.9.3`) — chosen.** Fully supported by
  `typescript-eslint@8`, aligned with NestJS 11, battle-tested with the decorator
  toolchain.
- **Adopt TypeScript 7 now.** Breaks `typescript-eslint`, unproven with our decorator
  stack; premature.
- **Adopt the 6.0 beta.** Still outside the linter's peer range and a beta; no.

Note this is the one place we deliberately do **not** chase `latest`; every other
dependency is pinned to its current stable release.

## Decision

We pin **TypeScript to `^5.9.3`** (the latest stable 5.x). We revisit an upgrade to
the native compiler only once `typescript-eslint` (and the wider Nest/`ts-jest`
ecosystem) officially supports it, at which point the change is recorded as a
superseding ADR.

The compiler target is set to `ES2023` to match our Node 22 runtime
(see [ADR 12](0012-target-node-22-lts.md)).

## Consequences

- The lint, build, and test toolchain stays within every tool's supported peer
  range; no version-mismatch breakage.
- We forgo the new compiler's speed for now — a non-issue at this scope.
- The `typescript` caret stays on 5.x, so `npm install` will not silently pull 6/7
  even as they become `latest`. This pin is intentional and must not be "upgraded"
  without re-checking `typescript-eslint` and NestJS support first.
- When the ecosystem catches up, migrating is a contained change (bump `typescript`,
  re-run lint/build/tests) documented via a new ADR.
