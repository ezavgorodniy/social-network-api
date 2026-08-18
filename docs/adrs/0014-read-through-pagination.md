# 14. Read-through pagination: the platform owns paging (amends ADR 5)

## Status

Accepted

## Context

`GET /posts/:postId/comments?limit&cursor` retrieves comments for a published
post. The endpoint does three things: fetch from the platform, upsert the result
into our store, and return a page. The open question is **who owns pagination —
the platform, or our database** — because that decides the `CommentRepository`
contract we are about to build.

Two facts frame the choice:

- **Comments are a cache; the platform is the source of truth** (see
  [ADR 9](0009-persist-posts-cache-comments.md)). We store a projection for
  history, cross-platform queries, and resilience, accepting staleness.
- We previously settled — during implementation, but never in an ADR — that the
  API `cursor` is an **opaque, pass-through** value: the platform's own paging
  token, forwarded verbatim as `nextCursor` and back in. This is currently only
  documented in the API reference in `docs/README.md`. This ADR records it.

Meanwhile [ADR 5](0005-use-repository-pattern.md) (written earlier) anticipated
that both repository implementations would "mirror cursor pagination." That line
predates the opaque pass-through decision and now pulls in a different direction,
which this ADR resolves.

Options considered:

- **Read-through (platform owns pagination) — chosen.** The API `cursor` *is* the
  platform's opaque `after`. Each request resolves `postId -> externalId`, calls
  `adapter.fetchComments(externalId, { limit, cursor })`, upserts the returned
  page, and returns those rows plus the platform's `nextCursor`. The database is a
  write-through cache; the GET never paginates the database. The repository does
  **no** cursor logic — only lookups and an idempotent upsert.
- **Read-from-cache (our database owns pagination).** Refresh from the platform,
  upsert, then serve a page from the database using our own keyset cursor (e.g.
  base64 of `(createdAt, id)`), oldest-first. The API `cursor` would be ours. This
  matches ADR 5 literally but contradicts the opaque pass-through decision,
  introduces a second cursor scheme to reconcile, blurs "how deep we refresh"
  versus "how deep we read," and adds keyset logic that both repository
  implementations must keep aligned.

## Decision

We adopt **read-through pagination**. The platform owns paging; the API `cursor`
is the platform's opaque token, passed through unchanged. The comments store is a
write-through cache: `GET` fetches a page from the platform, upserts it
idempotently on `(platform, externalId)`, and returns that page.

Consequently, the `CommentRepository` interface carries **no cursor/pagination
logic**. It exposes only what the service needs to anchor and cache:

- `findPostById(postId)` — resolve our internal id to `(platform, externalId)`.
- `findCommentById(commentId)` — resolve a comment we are replying to.
- `upsertComments(...)` — idempotent upsert of a fetched page, returning domain
  rows with our internal ids.
- `upsertComment(...)` — persist a single created reply (also idempotent).

This **amends** [ADR 5](0005-use-repository-pattern.md): its expectation that the
repositories "mirror cursor pagination" no longer applies under read-through, so
the in-memory and Prisma implementations mirror ordering and idempotent upsert but
*not* a cursor scheme. ADR 5's core decision — a domain-typed repository behind an
injection token, with Prisma and in-memory implementations — is unchanged. It
relates to [ADR 9](0009-persist-posts-cache-comments.md) (cache framing) and uses
the same "amends, not supersedes" relationship introduced in
[ADR 13](0013-adopt-prisma-7-driver-adapter.md).

Database-owned keyset pagination (encoded cursors, time-window filters) remains a
deliberate non-goal for this iteration and stays on the PLAN backlog
("Pagination hardening").

## Consequences

- The repository contract stays small and the two implementations are trivially
  aligned: there is no cursor keyset to reproduce in the in-memory double, only
  lookups, ordering, and idempotent upsert.
- Every `GET` calls the platform, so reads are always as fresh as the upstream
  response; the cache is used for resilience, history, and reply persistence, not
  for serving reads independently of the platform.
- Because the cursor is the platform's opaque token, we do not validate or decode
  it; an invalid cursor surfaces as an upstream platform error (502), consistent
  with [ADR 10](0010-use-native-fetch-for-outbound-http.md)'s error mapping.
- Serving reads from the cache (fewer upstream calls once warm) is not available in
  this iteration; adopting it later means introducing a DB-owned cursor behind the
  existing repository seam, recorded as a superseding/amending ADR.
- ADR 5's "shared contract test suite across both implementations" still applies,
  minus the cursor-pagination assertions.
