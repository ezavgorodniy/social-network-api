// Platform Adapter/Strategy seam (see ADR 0006).
//
// Each social platform has a different API shape; a PlatformAdapter normalises
// those differences behind one contract so the service stays platform-agnostic.
// Adapters return platform-native projections (PlatformComment) and know nothing
// about our persistence identity — the service/repository stitch in our internal
// postId and mint our id via upsert.

import type { Platform } from '@app/domain/comment';

/**
 * Multi-provider injection token collecting every registered `PlatformAdapter`.
 * The registry injects the whole set and indexes it by platform (see ADR 0006).
 */
export const PLATFORM_ADAPTERS = Symbol('PlatformAdapters');

/**
 * A comment as seen on the platform, normalised into our field names. Carries the
 * platform's own identifiers only; our internal `postId`/`id` are added later by
 * the repository. `parentExternalId` threads replies using the platform's ids.
 */
export interface PlatformComment {
  readonly externalId: string;
  readonly authorHandle: string;
  readonly content: string;
  readonly parentExternalId: string | null;
  readonly createdAt: Date;
}

/** One page of fetched comments plus the platform's opaque cursor for the next page. */
export interface PlatformCommentPage {
  readonly comments: readonly PlatformComment[];
  /** Opaque platform paging cursor; `null` when there are no more pages. */
  readonly nextCursor: string | null;
}

export interface FetchCommentsOptions {
  readonly limit: number;
  /** Opaque cursor from a previous page, forwarded verbatim to the platform. */
  readonly cursor?: string;
}

/**
 * Normalises one platform's comment API. Selected at runtime by the
 * `PlatformAdapterRegistry`; the service never knows which platform it is calling.
 */
export interface PlatformAdapter {
  readonly platform: Platform;

  /** Fetch a page of comments for a post identified by the platform's own id. */
  fetchComments(
    postExternalId: string,
    options: FetchCommentsOptions,
  ): Promise<PlatformCommentPage>;

  /** Post a reply to a comment identified by the platform's own id; returns the created reply. */
  postReply(parentCommentExternalId: string, content: string): Promise<PlatformComment>;
}
