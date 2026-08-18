import { Inject, Injectable } from '@nestjs/common';

import type { Comment } from '@app/domain/comment';
import { CommentNotFoundError, PostNotFoundError } from '@app/domain/errors';
import { PlatformAdapterRegistry } from '@app/platforms/platform-adapter-registry';
import {
  COMMENT_REPOSITORY,
  type CommentRepository,
} from '@app/repositories/comment-repository';

/** Options for a comment-listing request, already validated at the HTTP boundary. */
export interface GetCommentsOptions {
  readonly limit: number;
  readonly cursor?: string;
}

/** A listed page: the cached comments plus the platform's opaque next-page cursor. */
export interface GetCommentsResult {
  readonly comments: readonly Comment[];
  readonly nextCursor: string | null;
}

/**
 * Orchestrates the two use cases (see PLAN.md). It depends only on abstractions —
 * the `CommentRepository` token and the `PlatformAdapterRegistry` — so it stays
 * free of Prisma, HTTP, and per-platform details. Read-through pagination (ADR
 * 0014): the platform owns paging, the repository just caches what we fetch.
 */
@Injectable()
export class CommentService {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly repository: CommentRepository,
    private readonly registry: PlatformAdapterRegistry,
  ) {}

  /**
   * Fetch a page of comments for a post: resolve the post to its platform id,
   * fetch live from the platform adapter, cache the page via idempotent upsert,
   * and return the cached rows with the platform's next-page cursor.
   */
  async getComments(postId: string, options: GetCommentsOptions): Promise<GetCommentsResult> {
    const post = await this.repository.findPostById(postId);
    if (post === null) {
      throw new PostNotFoundError(postId);
    }

    const adapter = this.registry.get(post.platform);
    const page = await adapter.fetchComments(post.externalId, {
      limit: options.limit,
      cursor: options.cursor,
    });

    const comments = await this.repository.upsertComments({ post, comments: page.comments });
    return { comments, nextCursor: page.nextCursor };
  }

  /**
   * Reply to a comment: resolve the parent comment and its anchoring post, post
   * the reply through the platform adapter (a real outbound call), then persist
   * the created reply threaded under the parent.
   */
  async replyToComment(commentId: string, content: string): Promise<Comment> {
    const parent = await this.repository.findCommentById(commentId);
    if (parent === null) {
      throw new CommentNotFoundError(commentId);
    }

    // The parent always references a known post, but resolve it explicitly so the
    // upsert has the full anchor; treat a missing post as the post being gone.
    const post = await this.repository.findPostById(parent.postId);
    if (post === null) {
      throw new PostNotFoundError(parent.postId);
    }

    const adapter = this.registry.get(post.platform);
    const created = await adapter.postReply(parent.externalId, content);

    return this.repository.upsertComment({
      post,
      externalId: created.externalId,
      authorHandle: created.authorHandle,
      content: created.content,
      parentCommentId: parent.id,
      createdAt: created.createdAt,
    });
  }
}
