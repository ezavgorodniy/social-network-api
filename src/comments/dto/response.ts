// Response shapes for the comments endpoints.
//
// The domain `Comment` carries `Date` fields; the API serializes them as ISO-8601
// strings via an explicit mapper rather than relying on implicit JSON coercion,
// so the wire contract is stated in one place. GET returns `{ data, meta }` and
// reply returns `{ data }` (201) — a consistent envelope across both routes.

import type { Comment } from '@app/domain/comment';

/** A comment serialized for the wire: dates rendered as ISO-8601 strings. */
export interface CommentResponse {
  readonly id: string;
  readonly postId: string;
  readonly platform: string;
  readonly externalId: string;
  readonly authorHandle: string;
  readonly content: string;
  readonly parentCommentId: string | null;
  readonly createdAt: string;
  readonly syncedAt: string;
}

/** GET envelope: the cached page plus the platform's opaque next-page cursor. */
export interface ListCommentsResponse {
  readonly data: readonly CommentResponse[];
  readonly meta: { readonly nextCursor: string | null };
}

/** Reply envelope: the single persisted reply. */
export interface CreateReplyResponse {
  readonly data: CommentResponse;
}

export function toCommentResponse(comment: Comment): CommentResponse {
  return {
    id: comment.id,
    postId: comment.postId,
    platform: comment.platform,
    externalId: comment.externalId,
    authorHandle: comment.authorHandle,
    content: comment.content,
    parentCommentId: comment.parentCommentId,
    createdAt: comment.createdAt.toISOString(),
    syncedAt: comment.syncedAt.toISOString(),
  };
}

export function toListCommentsResponse(
  comments: readonly Comment[],
  nextCursor: string | null,
): ListCommentsResponse {
  return {
    data: comments.map((comment) => toCommentResponse(comment)),
    meta: { nextCursor },
  };
}

export function toCreateReplyResponse(comment: Comment): CreateReplyResponse {
  return { data: toCommentResponse(comment) };
}
