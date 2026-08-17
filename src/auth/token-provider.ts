// Authentication seam.
//
// Adapters depend on `TokenProvider`, never on where the token comes from. This
// iteration binds a request-scoped, pass-through (BYOT) implementation that reads
// the caller-supplied `X-Platform-Token` header; a server-side vault-sourced
// provider can be swapped in later without touching adapters (see ADR 0007).

/**
 * The dedicated request header carrying the platform access token. We deliberately
 * do NOT reuse `Authorization`, so our own API can use it later without conflict
 * (see ADR 0007). This value must never be logged or persisted.
 *
 * Intentionally lowercase: Node normalises all incoming HTTP header names to
 * lowercase, so `req.headers` is keyed by `x-platform-token` regardless of the
 * casing the client sent. Callers may use any casing (headers are case-insensitive).
 */
export const PLATFORM_TOKEN_HEADER = 'x-platform-token';

/** Nest injection token: interfaces are erased at runtime, so we bind by symbol. */
export const TOKEN_PROVIDER = Symbol('TokenProvider');

/** Supplies the OAuth2 bearer token used to authenticate outbound platform calls. */
export interface TokenProvider {
  /**
   * Returns the platform access token for the current request. Implementations
   * throw `MissingPlatformTokenError` when no token is available.
   */
  getToken(): string;
}
