import type { Platform } from '@app/domain/comment';
import { PlatformNotImplementedError } from '@app/domain/errors';
import type {
  FetchCommentsOptions,
  PlatformAdapter,
  PlatformComment,
  PlatformCommentPage,
} from './platform-adapter';

/**
 * Explicit stub for platforms recognised by the `Platform` enum but not yet
 * implemented (see ADR 0006). Every operation fails loudly with a typed error
 * (surfaced as HTTP 501) rather than misbehaving silently, marking the extension
 * point for adding a real adapter.
 */
export class NotImplementedAdapter implements PlatformAdapter {
  constructor(readonly platform: Platform) {}

  fetchComments(
    _postExternalId: string,
    _options: FetchCommentsOptions,
  ): Promise<PlatformCommentPage> {
    throw new PlatformNotImplementedError(this.platform);
  }

  postReply(_parentCommentExternalId: string, _content: string): Promise<PlatformComment> {
    throw new PlatformNotImplementedError(this.platform);
  }
}
