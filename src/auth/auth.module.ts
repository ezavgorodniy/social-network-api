import { Module } from '@nestjs/common';

import { RequestScopedTokenProvider } from './request-scoped-token-provider';
import { TOKEN_PROVIDER } from './token-provider';

/**
 * Binds the pass-through `TokenProvider` (see ADR 0007) and exports the injection
 * token so platform adapters can depend on the interface, not the implementation.
 */
@Module({
  providers: [{ provide: TOKEN_PROVIDER, useClass: RequestScopedTokenProvider }],
  exports: [TOKEN_PROVIDER],
})
export class AuthModule {}
