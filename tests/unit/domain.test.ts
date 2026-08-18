import { isPlatform, PLATFORMS } from '@app/domain/comment';
import {
  CommentNotFoundError,
  DomainError,
  InvalidRequestError,
  PlatformNotImplementedError,
  PostNotFoundError,
  UpstreamPlatformError,
} from '@app/domain/errors';
import { HttpStatus } from '@app/domain/http-status';

describe('isPlatform', () => {
  it.each(PLATFORMS)('accepts the known platform %s', (platform) => {
    expect(isPlatform(platform)).toBe(true);
  });

  it.each([['facebook'], ['UNKNOWN'], [''], [42], [null], [undefined], [{}]])(
    'rejects non-platform value %p',
    (value) => {
      expect(isPlatform(value)).toBe(false);
    },
  );
});

describe('domain errors', () => {
  const cases = [
    {
      name: 'InvalidRequestError',
      error: new InvalidRequestError('limit must be a positive integer'),
      code: 'INVALID_REQUEST',
      httpStatus: HttpStatus.BAD_REQUEST,
      message: 'limit must be a positive integer',
    },
    {
      name: 'PostNotFoundError',
      error: new PostNotFoundError('post-1'),
      code: 'POST_NOT_FOUND',
      httpStatus: HttpStatus.NOT_FOUND,
      message: 'Post not found: post-1',
    },
    {
      name: 'CommentNotFoundError',
      error: new CommentNotFoundError('comment-1'),
      code: 'COMMENT_NOT_FOUND',
      httpStatus: HttpStatus.NOT_FOUND,
      message: 'Comment not found: comment-1',
    },
    {
      name: 'PlatformNotImplementedError',
      error: new PlatformNotImplementedError('TWITTER'),
      code: 'PLATFORM_NOT_IMPLEMENTED',
      httpStatus: HttpStatus.NOT_IMPLEMENTED,
      message: 'Platform not implemented: TWITTER',
    },
    {
      name: 'UpstreamPlatformError',
      error: new UpstreamPlatformError('FACEBOOK', 'rate limited'),
      code: 'UPSTREAM_PLATFORM_ERROR',
      httpStatus: HttpStatus.BAD_GATEWAY,
      message: 'Upstream platform error (FACEBOOK): rate limited',
    },
  ] as const;

  it.each(cases)(
    '$name exposes its code, status, message, and type contract',
    ({ name, error, code, httpStatus, message }) => {
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(code);
      expect(error.httpStatus).toBe(httpStatus);
      expect(error.name).toBe(name);
      expect(error.message).toBe(message);
    },
  );
});
