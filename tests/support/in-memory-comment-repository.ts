import { Injectable } from '@nestjs/common';

import type { Comment, Platform, Post } from '@app/domain/comment';
import type {
  CommentRepository,
  UpsertCommentsInput,
  UpsertReplyInput,
} from '@app/repositories/comment-repository';

/**
 * Test double for `CommentRepository` (see ADR 0005). Lives under tests/ because
 * production never depends on it — `RepositoriesModule` binds only the Prisma
 * implementation; unit and e2e tests substitute this one via Nest's testing
 * module. It mirrors the Prisma implementation's observable semantics —
 * oldest-first ordering, idempotent upsert on `(platform, externalId)`, and reply
 * threading — with no database, and (like Prisma) no cursor logic (ADR 0014).
 *
 * Its correctness is asserted through the shared contract suite
 * (`comment-repository.contract.ts`), not by testing the double in isolation.
 */
@Injectable()
export class InMemoryCommentRepository implements CommentRepository {
  private readonly posts = new Map<string, Post>();
  private readonly comments = new Map<string, Comment>();
  private idCounter = 0;

  /** Test seam: register a known post so lookups and upserts can anchor to it. */
  seedPost(post: Post): void {
    this.posts.set(post.id, post);
  }

  async findPostById(postId: string): Promise<Post | null> {
    return this.posts.get(postId) ?? null;
  }

  async findCommentById(commentId: string): Promise<Comment | null> {
    return this.comments.get(commentId) ?? null;
  }

  async upsertComments(input: UpsertCommentsInput): Promise<Comment[]> {
    const { post, comments } = input;
    const syncedAt = new Date();

    for (const comment of comments) {
      this.upsertOne({
        post,
        externalId: comment.externalId,
        authorHandle: comment.authorHandle,
        content: comment.content,
        parentCommentId: null,
        createdAt: comment.createdAt,
        syncedAt,
      });
    }

    for (const comment of comments) {
      if (comment.parentExternalId === null) {
        continue;
      }
      const parent = this.findByPlatformExternalId(post.platform, comment.parentExternalId);
      if (parent === undefined) {
        continue;
      }
      // Both child and parent were upserted in the first loop, so both are present.
      const child = this.getByPlatformExternalId(post.platform, comment.externalId);
      this.comments.set(child.id, { ...child, parentCommentId: parent.id });
    }

    return comments
      .map((comment) => this.getByPlatformExternalId(post.platform, comment.externalId))
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async upsertComment(input: UpsertReplyInput): Promise<Comment> {
    return this.upsertOne({
      post: input.post,
      externalId: input.externalId,
      authorHandle: input.authorHandle,
      content: input.content,
      parentCommentId: input.parentCommentId,
      createdAt: input.createdAt,
      syncedAt: new Date(),
    });
  }

  private upsertOne(fields: {
    post: Post;
    externalId: string;
    authorHandle: string;
    content: string;
    parentCommentId: string | null;
    createdAt: Date;
    syncedAt: Date;
  }): Comment {
    const existing = this.findByPlatformExternalId(fields.post.platform, fields.externalId);
    if (existing !== undefined) {
      const updated: Comment = {
        ...existing,
        authorHandle: fields.authorHandle,
        content: fields.content,
        parentCommentId: fields.parentCommentId ?? existing.parentCommentId,
        syncedAt: fields.syncedAt,
      };
      this.comments.set(updated.id, updated);
      return updated;
    }

    const created: Comment = {
      id: `c${(this.idCounter += 1)}`,
      postId: fields.post.id,
      platform: fields.post.platform,
      externalId: fields.externalId,
      authorHandle: fields.authorHandle,
      content: fields.content,
      parentCommentId: fields.parentCommentId,
      createdAt: fields.createdAt,
      syncedAt: fields.syncedAt,
    };
    this.comments.set(created.id, created);
    return created;
  }

  private findByPlatformExternalId(
    platform: Platform,
    externalId: string,
  ): Comment | undefined {
    for (const comment of this.comments.values()) {
      if (comment.platform === platform && comment.externalId === externalId) {
        return comment;
      }
    }
    return undefined;
  }

  /** Like {@link findByPlatformExternalId} but for comments known to exist (post-upsert). */
  private getByPlatformExternalId(platform: Platform, externalId: string): Comment {
    const comment = this.findByPlatformExternalId(platform, externalId);
    if (comment === undefined) {
      throw new Error(`Comment (${platform}, ${externalId}) expected in store but missing`);
    }
    return comment;
  }
}
