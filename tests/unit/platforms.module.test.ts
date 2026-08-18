import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';

import { PlatformNotImplementedError } from '@app/domain/errors';
import { PLATFORM_TOKEN_HEADER } from '@app/auth/token-provider';
import { FacebookAdapter } from '@app/platforms/facebook-adapter';
import { PlatformsModule } from '@app/platforms/platforms.module';
import { PlatformAdapterRegistry } from '@app/platforms/platform-adapter-registry';

describe('PlatformsModule', () => {
  async function resolveRegistry(): Promise<PlatformAdapterRegistry> {
    const moduleRef = await Test.createTestingModule({ imports: [PlatformsModule] })
      .overrideProvider(REQUEST)
      .useValue({ headers: { [PLATFORM_TOKEN_HEADER]: 'tok' } } as unknown as IncomingMessage)
      .compile();
    return moduleRef.resolve(PlatformAdapterRegistry);
  }

  it('resolves the real Facebook adapter', async () => {
    const registry = await resolveRegistry();
    expect(registry.get('FACEBOOK')).toBeInstanceOf(FacebookAdapter);
  });

  it.each(['TWITTER', 'INSTAGRAM', 'LINKEDIN'] as const)(
    'registers %s as a not-implemented stub that fails loudly',
    async (platform) => {
      const registry = await resolveRegistry();
      const adapter = registry.get(platform);
      expect(adapter.platform).toBe(platform);
      expect(() => adapter.fetchComments('p', { limit: 20 })).toThrow(
        PlatformNotImplementedError,
      );
    },
  );
});
