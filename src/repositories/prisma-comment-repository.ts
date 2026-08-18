import { Injectable } from '@nestjs/common';
import type { Comment as PrismaComment, Post as PrismaPost } from '@prisma/client';

import type { Comment, Post } from '@app/domain/comment';
import { PrismaService } from '@app/prisma/prisma.service';
import type {
  CommentRepository,
  UpsertCommentsInput,
  UpsertReplyInput,
} from './comment-repository';

/**
 * Production repository backed by Prisma/PostgreSQL. Maps Prisma rows to domain
 * types so the service never sees an ORM shape. Upserts are idempotent on
 * `(platform, externalId)`; there is no cursor logic (read-through, ADR 0014).
 */
@Injectable()
export class PrismaCommentRepository implements CommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPostById(postId: string): Promise<Post | null> {
    const row = await this.prisma.post.findUnique({ where: { id: postId } });
    return row === null ? null : this.toPost(row);
  }

  async findCommentById(commentId: string): Promise<Comment | null> {
    const row = await this.prisma.comment.findUnique({ where: { id: commentId } });
    return row === null ? null : this.toComment(row);
  }

  async upsertComments(input: UpsertCommentsInput): Promise<Comment[]> {
    const { post, comments } = input;
    if (comments.length === 0) {
      return [];
    }

    const syncedAt = new Date();

    // Pass 1: upsert every comment so each externalId has an internal id, before
    // we can resolve any parent references (which may point within this page).
    await this.prisma.$transaction(
      comments.map((comment) =>
        this.prisma.comment.upsert({
          where: {
            platform_externalId: { platform: post.platform, externalId: comment.externalId },
          },
          create: {
            postId: post.id,
            platform: post.platform,
            externalId: comment.externalId,
            authorHandle: comment.authorHandle,
            content: comment.content,
            createdAt: comment.createdAt,
            syncedAt,
          },
          update: {
            authorHandle: comment.authorHandle,
            content: comment.content,
            syncedAt,
          },
        }),
      ),
    );

    // Pass 2: resolve parentExternalId -> internal id and thread the replies.
    const childToParentExternalId = new Map<string, string>();
    for (const comment of comments) {
      if (comment.parentExternalId !== null) {
        childToParentExternalId.set(comment.externalId, comment.parentExternalId);
      }
    }

    if (childToParentExternalId.size > 0) {
      const parentExternalIds = [...new Set(childToParentExternalId.values())];
      const parents = await this.prisma.comment.findMany({
        where: { platform: post.platform, externalId: { in: parentExternalIds } },
        select: { id: true, externalId: true },
      });
      const internalIdByExternalId = new Map(
        parents.map((parent) => [parent.externalId, parent.id]),
      );

      const threadingUpdates: { childExternalId: string; parentCommentId: string }[] = [];
      for (const [childExternalId, parentExternalId] of childToParentExternalId) {
        const parentCommentId = internalIdByExternalId.get(parentExternalId);
        if (parentCommentId !== undefined) {
          threadingUpdates.push({ childExternalId, parentCommentId });
        }
      }

      if (threadingUpdates.length > 0) {
        await this.prisma.$transaction(
          threadingUpdates.map((entry) =>
            this.prisma.comment.update({
              where: {
                platform_externalId: {
                  platform: post.platform,
                  externalId: entry.childExternalId,
                },
              },
              data: { parentCommentId: entry.parentCommentId },
            }),
          ),
        );
      }
    }

    const rows = await this.prisma.comment.findMany({
      where: {
        postId: post.id,
        platform: post.platform,
        externalId: { in: comments.map((comment) => comment.externalId) },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toComment(row));
  }

  async upsertComment(input: UpsertReplyInput): Promise<Comment> {
    const syncedAt = new Date();
    const row = await this.prisma.comment.upsert({
      where: {
        platform_externalId: { platform: input.post.platform, externalId: input.externalId },
      },
      create: {
        postId: input.post.id,
        platform: input.post.platform,
        externalId: input.externalId,
        authorHandle: input.authorHandle,
        content: input.content,
        parentCommentId: input.parentCommentId,
        createdAt: input.createdAt,
        syncedAt,
      },
      update: {
        authorHandle: input.authorHandle,
        content: input.content,
        parentCommentId: input.parentCommentId,
        syncedAt,
      },
    });
    return this.toComment(row);
  }

  private toPost(row: PrismaPost): Post {
    return {
      id: row.id,
      platform: row.platform,
      externalId: row.externalId,
      publishedAt: row.publishedAt,
    };
  }

  private toComment(row: PrismaComment): Comment {
    return {
      id: row.id,
      postId: row.postId,
      platform: row.platform,
      externalId: row.externalId,
      authorHandle: row.authorHandle,
      content: row.content,
      parentCommentId: row.parentCommentId,
      createdAt: row.createdAt,
      syncedAt: row.syncedAt,
    };
  }
}
