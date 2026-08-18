// The data-access contract the service depends on (see ADR 0005).
//
// Under read-through pagination (ADR 0014) the platform owns paging, so this
// interface carries NO cursor logic — only lookups and idempotent upserts. Two
// implementations satisfy it: PrismaCommentRepository (production) and
// InMemoryCommentRepository (tests), which mirror ordering and upsert semantics.

import type { Comment, Post } from '@app/domain/comment';

/** Injection token: interfaces are erased at runtime, so we bind by Symbol (ADR 0005). */
export const COMMENT_REPOSITORY = Symbol('CommentRepository');

/**
 * One comment as fetched from a platform page, in domain field names. The parent
 * is identified by the platform's own id (`parentExternalId`); the repository
 * resolves it to our internal `parentCommentId` when persisting.
 */
export interface FetchedComment {
  readonly externalId: string;
  readonly authorHandle: string;
  readonly content: string;
  readonly parentExternalId: string | null;
  readonly createdAt: Date;
}

/** A fetched page to cache: the anchoring post plus the platform's comments. */
export interface UpsertCommentsInput {
  readonly post: Post;
  readonly comments: readonly FetchedComment[];
}

/**
 * A single reply we authored and want to persist. Unlike a fetched page, the
 * parent is already known by our internal id because the service resolved it
 * before posting, so we store `parentCommentId` directly.
 */
export interface UpsertReplyInput {
  readonly post: Post;
  readonly externalId: string;
  readonly authorHandle: string;
  readonly content: string;
  readonly parentCommentId: string;
  readonly createdAt: Date;
}

export interface CommentRepository {
  /** Resolve our internal post id to `(platform, externalId)`; `null` if unknown. */
  findPostById(postId: string): Promise<Post | null>;

  /** Resolve a comment we are replying to; `null` if unknown. */
  findCommentById(commentId: string): Promise<Comment | null>;

  /**
   * Idempotently upsert a fetched page on `(platform, externalId)`, returning the
   * cached rows with our internal ids, ordered oldest-first. Replies whose parent
   * is present in the page or already cached are threaded via `parentCommentId`.
   */
  upsertComments(input: UpsertCommentsInput): Promise<Comment[]>;

  /** Idempotently upsert a single authored reply on `(platform, externalId)`. */
  upsertComment(input: UpsertReplyInput): Promise<Comment>;
}
