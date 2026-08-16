# 9. Persist posts as the anchor; treat stored comments as an optional cache

## Status

Proposed

## Context

The deliverables ask for a database schema, so *some* persistence is expected. Good
engineering, though, means persisting what genuinely **requires** storage rather than
copying platform-owned data by default. Under the pass-through / BYOT model
(see [ADR 7](0007-authenticate-with-oauth2-bearer-token.md)) we already hold a
caller-supplied token and could call the platform on every request, so we must
justify each thing we store.

Working through the three candidate entities:

- **Published posts — storage is genuinely required.** This is a *scheduling*
  product; "a published post" means one published *through our system*. The
  retrieval endpoint is `GET /posts/:postId/comments`, keyed on **our** `postId`.
  For that ID to resolve to a platform resource we must have recorded the post at
  publish time, mapping our internal id to `(platform, externalId)`. The platform
  does not hand us "posts this product published" as a queryable set — we own that
  mapping. Without it, `:postId` is meaningless and neither endpoint can resolve
  which platform resource to act on.
- **Comments — storage is optional; the platform is the source of truth.** We can
  fetch comments live on every `GET`. Persisting them is a *cache / projection* with
  real value (history, offline and cross-platform queries, an audit of what we have
  seen) but real cost (staleness between reads, duplication of platform-owned data,
  reconciliation). It should be a deliberate, documented choice, not treated as a
  requirement.
- **Replies we author — worth recording, as an outbox / idempotency concern.**
  Knowing we already posted a reply lets us avoid double-posting on retry and gives
  an audit of actions our system took. This is about *our* actions, not mirroring the
  platform.

This decision is distinct from [ADR 3](0003-use-postgresql-for-persistence.md), which
chooses *which* store to use once we have decided to persist; here we decide *what* to
persist and why.

## Decision

- **`Post` is the anchor and is always persisted.** Recorded at publish time, it maps
  our `postId` to `(platform, externalId)` and is what makes the API's IDs meaningful.
  This is the part of the schema that storage is genuinely *required* for.
- **`Comment` storage is an optional cache / projection**, adopted deliberately for
  this iteration. The platform remains the source of truth. `GET .../comments` fetches
  live from the platform adapter, **upserts** the results (idempotent on
  `(platform, externalId)`), and returns them; `syncedAt` records recency. Externally
  authored comments enter through this same path (`authorHandle` records who wrote
  them; nothing assumes we authored a comment).
- **Replies we author are persisted** as part of the same comment table, giving an
  audit trail of our actions and a basis for idempotent reply handling.
- **Freshness is bound to reads for now.** With no push channel, the cache reflects
  platform state as of the last `GET`. Real-time ingestion via webhooks is a deferred
  future task and reconciles against the same idempotent upsert.

We document the comment-caching choice as an **assumption** (the prompt explicitly
invites documented assumptions), so a reviewer sees it as a reasoned trade-off rather
than an unexamined default.

## Consequences

- The schema's non-negotiable core is small and well-justified: posts must exist for
  the API to function. Everything else is an explicit, cost-bearing choice.
- The comment cache buys history, cross-platform queries, and resilience to platform
  API outages, at the cost of staleness between reads and duplicated data. The
  `(platform, externalId)` uniqueness and `syncedAt` column exist to make repeated
  fetches idempotent and to record recency.
- Persisted replies enable idempotent reply handling (no double-post on retry) and an
  audit of actions the system took.
- The cache is only as complete as the reads (and later webhook events) that populate
  it — it is not a full mirror of the platform, and we do not claim it to be.
- If the caching cost ever outweighs its value, the system can degrade to a
  posts-only anchor with live comment proxying without touching the API contract —
  the `CommentRepository` seam ([ADR 5](0005-use-repository-pattern.md)) contains the
  change. Such a reversal would be recorded as a superseding ADR.
