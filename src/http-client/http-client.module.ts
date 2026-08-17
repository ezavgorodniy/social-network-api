import { Module } from '@nestjs/common';

import { FetchHttpClient } from './fetch-http-client';
import { HTTP_CLIENT } from './http-client';

/**
 * Binds the native-`fetch` `HttpClient` (see ADR 0010) and exports the injection
 * token so platform adapters depend on the interface, not the implementation.
 */
@Module({
  providers: [{ provide: HTTP_CLIENT, useClass: FetchHttpClient }],
  exports: [HTTP_CLIENT],
})
export class HttpClientModule {}
