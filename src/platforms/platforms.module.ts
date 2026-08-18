import { Module } from '@nestjs/common';

import { AuthModule } from '@app/auth/auth.module';
import { HttpClientModule } from '@app/http-client/http-client.module';
import { FacebookAdapter } from './facebook-adapter';
import { NotImplementedAdapter } from './not-implemented-adapter';
import { PLATFORM_ADAPTERS, type PlatformAdapter } from './platform-adapter';
import { PlatformAdapterRegistry } from './platform-adapter-registry';

/**
 * Assembles the platform adapters (see ADR 0006): Facebook is fully implemented;
 * Twitter, Instagram, and LinkedIn are explicit not-implemented stubs. All are
 * collected under the `PLATFORM_ADAPTERS` multi-provider token and indexed by the
 * `PlatformAdapterRegistry`, which is the only export the service depends on.
 */
@Module({
  imports: [AuthModule, HttpClientModule],
  providers: [
    FacebookAdapter,
    {
      provide: PLATFORM_ADAPTERS,
      useFactory: (facebook: FacebookAdapter): PlatformAdapter[] => [
        facebook,
        new NotImplementedAdapter('TWITTER'),
        new NotImplementedAdapter('INSTAGRAM'),
        new NotImplementedAdapter('LINKEDIN'),
      ],
      inject: [FacebookAdapter],
    },
    PlatformAdapterRegistry,
  ],
  exports: [PlatformAdapterRegistry],
})
export class PlatformsModule {}
