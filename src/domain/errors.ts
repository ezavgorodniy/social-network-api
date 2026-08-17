// Typed domain errors.
//
// The service and adapters throw these; the Nest exception filter
// (src/common/all-exceptions.filter.ts) maps them to the shared envelope
// `{ "error": { "code", "message" } }` using `code` and `httpStatus`. Kept free
// of framework/HTTP types: `httpStatus` is a plain status number (see
// ./http-status), not a Nest type, so the domain has no framework dependency.

import type { Platform } from './comment';
import { HttpStatus, type HttpStatusCode } from './http-status';

/**
 * Base class for errors that represent a known, expected failure of a use case
 * (as opposed to an unexpected bug). Carries a stable machine-readable `code`
 * and the HTTP status the API should return.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: HttpStatusCode;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The caller did not supply a platform token (`X-Platform-Token`) on the request. */
export class MissingPlatformTokenError extends DomainError {
  readonly code = 'MISSING_PLATFORM_TOKEN';
  readonly httpStatus = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('Missing required X-Platform-Token header');
  }
}

/** The requested post is not known to this system, so its comments cannot resolve. */
export class PostNotFoundError extends DomainError {
  readonly code = 'POST_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor(postId: string) {
    super(`Post not found: ${postId}`);
  }
}

/** The comment being replied to is not known to this system. */
export class CommentNotFoundError extends DomainError {
  readonly code = 'COMMENT_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor(commentId: string) {
    super(`Comment not found: ${commentId}`);
  }
}

/** A platform is recognised by the enum but has no working adapter yet (stub). */
export class PlatformNotImplementedError extends DomainError {
  readonly code = 'PLATFORM_NOT_IMPLEMENTED';
  readonly httpStatus = HttpStatus.NOT_IMPLEMENTED;

  constructor(platform: Platform) {
    super(`Platform not implemented: ${platform}`);
  }
}

/** The upstream platform API failed or returned an unusable response. */
export class UpstreamPlatformError extends DomainError {
  readonly code = 'UPSTREAM_PLATFORM_ERROR';
  readonly httpStatus = HttpStatus.BAD_GATEWAY;

  constructor(platform: Platform, detail: string) {
    super(`Upstream platform error (${platform}): ${detail}`);
  }
}
