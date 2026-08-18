import { PlatformNotImplementedError } from '@app/domain/errors';
import { NotImplementedAdapter } from '@app/platforms/not-implemented-adapter';

describe('NotImplementedAdapter', () => {
  const adapter = new NotImplementedAdapter('LINKEDIN');

  it('exposes the platform it stands in for', () => {
    expect(adapter.platform).toBe('LINKEDIN');
  });

  it('throws PlatformNotImplementedError from fetchComments', () => {
    expect(() => adapter.fetchComments('post-1', { limit: 20 })).toThrow(
      PlatformNotImplementedError,
    );
  });

  it('throws PlatformNotImplementedError from postReply', () => {
    expect(() => adapter.postReply('comment-1', 'hi')).toThrow(PlatformNotImplementedError);
  });
});
