import { Inject, Injectable } from '@nestjs/common';

import type { Platform } from '@app/domain/comment';
import { PlatformNotImplementedError } from '@app/domain/errors';
import { PLATFORM_ADAPTERS, type PlatformAdapter } from './platform-adapter';

/**
 * Resolves the `PlatformAdapter` for a given platform. Adapters are collected via
 * the `PLATFORM_ADAPTERS` multi-provider token (see ADR 0006); this class indexes
 * them by `platform` and fails loudly for platforms with no working adapter.
 */
@Injectable()
export class PlatformAdapterRegistry {
  private readonly adaptersByPlatform: ReadonlyMap<Platform, PlatformAdapter>;

  constructor(@Inject(PLATFORM_ADAPTERS) adapters: readonly PlatformAdapter[]) {
    this.adaptersByPlatform = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
  }

  /** Returns the adapter for `platform`, or throws `PlatformNotImplementedError` (501). */
  get(platform: Platform): PlatformAdapter {
    const adapter = this.adaptersByPlatform.get(platform);
    if (adapter === undefined) {
      throw new PlatformNotImplementedError(platform);
    }
    return adapter;
  }
}
