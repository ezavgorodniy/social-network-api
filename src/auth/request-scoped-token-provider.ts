import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';

import { MissingPlatformTokenError } from '@app/domain/errors';
import { PLATFORM_TOKEN_HEADER, type TokenProvider } from './token-provider';

/**
 * Pass-through (BYOT) token provider: returns the platform access token the caller
 * supplied on the current request via `X-Platform-Token` (see ADR 0007). The token
 * is never stored or logged. Request-scoped so each request resolves its own token.
 */
@Injectable({ scope: Scope.REQUEST })
export class RequestScopedTokenProvider implements TokenProvider {
  constructor(@Inject(REQUEST) private readonly request: IncomingMessage) {}

  getToken(): string {
    const header = this.request.headers[PLATFORM_TOKEN_HEADER];
    // A repeated header parses as string[]; take the first value.
    const rawToken = Array.isArray(header) ? header[0] : header;
    const token = rawToken?.trim();

    if (token === undefined || token.length === 0) {
      throw new MissingPlatformTokenError();
    }

    return token;
  }
}
