import type { IncomingMessage } from 'node:http';

import { MissingPlatformTokenError } from '@app/domain/errors';
import { RequestScopedTokenProvider } from '@app/auth/request-scoped-token-provider';
import { PLATFORM_TOKEN_HEADER } from '@app/auth/token-provider';

// These tests inject a fake request whose header keys are already lowercase, so
// they exercise the provider's own logic (lookup, trimming, repeated headers,
// missing/blank). They do NOT prove HTTP header case-insensitivity — that is a
// property of Node's header normalisation and is verified with a real mixed-case
// request in the e2e suite.
function providerWithHeaders(
  headers: IncomingMessage['headers'],
): RequestScopedTokenProvider {
  return new RequestScopedTokenProvider({ headers } as unknown as IncomingMessage);
}

describe('RequestScopedTokenProvider', () => {
  it('returns the token from the X-Platform-Token header', () => {
    const provider = providerWithHeaders({ [PLATFORM_TOKEN_HEADER]: 'secret-token' });
    expect(provider.getToken()).toBe('secret-token');
  });

  it('trims surrounding whitespace from the token', () => {
    const provider = providerWithHeaders({ [PLATFORM_TOKEN_HEADER]: '  secret-token  ' });
    expect(provider.getToken()).toBe('secret-token');
  });

  it('uses the first value when the header is repeated', () => {
    const provider = providerWithHeaders({ [PLATFORM_TOKEN_HEADER]: ['first', 'second'] });
    expect(provider.getToken()).toBe('first');
  });

  it('throws MissingPlatformTokenError when the header is absent', () => {
    const provider = providerWithHeaders({});
    expect(() => provider.getToken()).toThrow(MissingPlatformTokenError);
  });

  it('throws MissingPlatformTokenError when the header is blank', () => {
    const provider = providerWithHeaders({ [PLATFORM_TOKEN_HEADER]: '   ' });
    expect(() => provider.getToken()).toThrow(MissingPlatformTokenError);
  });

  it('throws MissingPlatformTokenError when a repeated header is empty', () => {
    const provider = providerWithHeaders({ [PLATFORM_TOKEN_HEADER]: [] });
    expect(() => provider.getToken()).toThrow(MissingPlatformTokenError);
  });
});
