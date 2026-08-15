# 7. Authenticate to platforms with a caller-supplied (pass-through) bearer token

## Status

Proposed

## Context

To call a social platform's API (Facebook's Graph API first) the system must
present an OAuth2 access token as an `Authorization: Bearer <token>` header. The
question is *where that token comes from*.

An earlier proposal had the service source and manage tokens itself: a
`TokenProvider` backed by a secret vault in production and env locally, with a
switch between them (and a companion ADR for vault storage). That is the right
shape for a product that owns long-lived, per-account credentials — but it is a
significant amount of machinery (vault integration, environment switching, secret
rotation) for the current iteration, whose goals are a demonstrable vertical slice
that makes *real* platform calls with minimal ceremony.

We want the simplest model that still: keeps credentials out of source and logs,
does not couple adapters to token sourcing, and leaves room to grow into
server-side token management later.

Options considered:

- **Pass-through / bring-your-own-token (BYOT)** — the API caller supplies the
  platform access token on each request; we forward it to the platform and never
  store it. No vault, no secret store, no environment switch. The system is
  stateless with respect to credentials.
- **Server-side vault-sourced token** — the service holds/obtains tokens from a
  secret store keyed to the connected account. No token in API calls, but requires
  vault integration and rotation; heavier than this iteration needs.
- **Full OAuth2 authorization-code flow in-app** — implement login/redirect, code
  exchange, and refresh ourselves. Necessary for user-facing delegated access;
  large surface area, out of scope now.

## Decision

We use a **pass-through (BYOT) model behind the `TokenProvider` abstraction**.

- The caller supplies the platform access token on each request via a **dedicated
  header, `X-Platform-Token`**. We forward it to the platform as
  `Authorization: Bearer <token>` and **never persist or log it**.
- We keep the **`TokenProvider` interface** rather than reading the header inline,
  so the design stays clean and swappable. The implementation for this iteration
  is a **`RequestScopedTokenProvider`** (a request-scoped NestJS provider) that
  returns the token from the current request context. Adapters depend on
  `TokenProvider`, exactly as before — the change is confined to which
  implementation is bound.
- Because the abstraction is unchanged, migrating later to a server-side
  vault-sourced provider means swapping the bound implementation, not touching
  adapters or the service.

### Why a dedicated header (not `Authorization`)

We deliberately do **not** reuse `Authorization: Bearer <token>` for the platform
token. If we ever add authentication on *our own* API, `Authorization` will be the
natural place for our API's credentials, and overloading it with the downstream
platform token would conflict. A distinct `X-Platform-Token` header keeps the two
concerns separate and avoids a painful migration later.

**Out of scope (documented non-goals):** server-side token storage/vault (moved to
the future-tasks backlog), token refresh/lifecycle, and the authorization-code
login UI.

## Consequences

- Much less machinery: no vault, no secret store, no prod/local switch for this
  iteration. The auth story is "accept a token, pass it on."
- **The token now travels in every API request.** This is only safe over
  **HTTPS/TLS**, and request/error logging must be written to **never** capture
  the `X-Platform-Token` value. This is the primary security consideration and is
  called out in the docs.
- Credentials are never stored at rest; the system is stateless with respect to
  tokens.
- Token responsibility shifts to the caller: this fits an internal/service-to-
  service or demonstrable context, less so an end-user-facing product where the
  API would hold per-account tokens. That evolution is captured as a future task.
- No token refresh: an expired/invalid token simply yields a platform error
  (surfaced as 401/502). Acceptable given lifecycle management is deferred.
- The `TokenProvider` seam means the heavier server-side model can be adopted later
  via a superseding ADR without disturbing adapters or the service.
