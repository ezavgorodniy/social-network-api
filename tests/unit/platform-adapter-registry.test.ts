import { PlatformNotImplementedError } from '@app/domain/errors';
import { NotImplementedAdapter } from '@app/platforms/not-implemented-adapter';
import { PlatformAdapterRegistry } from '@app/platforms/platform-adapter-registry';
import type { PlatformAdapter } from '@app/platforms/platform-adapter';

const fakeFacebook: PlatformAdapter = {
  platform: 'FACEBOOK',
  fetchComments: jest.fn(),
  postReply: jest.fn(),
};

describe('PlatformAdapterRegistry', () => {
  it('returns the adapter registered for a platform', () => {
    const registry = new PlatformAdapterRegistry([fakeFacebook]);
    expect(registry.get('FACEBOOK')).toBe(fakeFacebook);
  });

  it('throws PlatformNotImplementedError for a platform with no adapter', () => {
    const registry = new PlatformAdapterRegistry([fakeFacebook]);
    expect(() => registry.get('TWITTER')).toThrow(PlatformNotImplementedError);
  });

  it('indexes multiple adapters by their platform', () => {
    const twitterStub = new NotImplementedAdapter('TWITTER');
    const registry = new PlatformAdapterRegistry([fakeFacebook, twitterStub]);
    expect(registry.get('FACEBOOK')).toBe(fakeFacebook);
    expect(registry.get('TWITTER')).toBe(twitterStub);
  });
});
