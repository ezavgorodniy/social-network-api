import type { Post } from '@app/domain/comment';
import { PrismaCommentRepository } from '@app/repositories/prisma-comment-repository';
import type { PrismaService } from '@app/prisma/prisma.service';
import type { FetchedComment } from '@app/repositories/comment-repository';

const post: Post = {
  id: 'post-1',
  platform: 'FACEBOOK',
  externalId: 'fb-post-1',
  publishedAt: new Date('2026-01-01T00:00:00Z'),
};

interface FakePrisma {
  post: { findUnique: jest.Mock };
  comment: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
}

function buildFakePrisma(): FakePrisma {
  return {
    post: { findUnique: jest.fn() },
    comment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    },
    // The real client runs the batched operations; our fake just awaits them so
    // the queued upsert/update mocks are invoked.
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
}

function buildRepository(fake: FakePrisma): PrismaCommentRepository {
  return new PrismaCommentRepository(fake as unknown as PrismaService);
}

function prismaRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'internal-1',
    postId: 'post-1',
    platform: 'FACEBOOK',
    externalId: 'c1',
    authorHandle: 'alice',
    content: 'hello',
    parentCommentId: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    syncedAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function fetched(overrides: Partial<FetchedComment> & { externalId: string }): FetchedComment {
  return {
    authorHandle: 'alice',
    content: 'hello',
    parentExternalId: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

describe('PrismaCommentRepository', () => {
  describe('findPostById', () => {
    it('returns null when Prisma finds no post', async () => {
      const fake = buildFakePrisma();
      fake.post.findUnique.mockResolvedValue(null);
      expect(await buildRepository(fake).findPostById('missing')).toBeNull();
    });

    it('maps a Prisma post row to the domain Post shape', async () => {
      const fake = buildFakePrisma();
      fake.post.findUnique.mockResolvedValue({
        id: 'post-1',
        platform: 'FACEBOOK',
        externalId: 'fb-post-1',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(await buildRepository(fake).findPostById('post-1')).toEqual(post);
    });
  });

  describe('findCommentById', () => {
    it('returns null when Prisma finds no comment', async () => {
      const fake = buildFakePrisma();
      fake.comment.findUnique.mockResolvedValue(null);
      expect(await buildRepository(fake).findCommentById('missing')).toBeNull();
    });

    it('maps a Prisma comment row to the domain Comment shape', async () => {
      const fake = buildFakePrisma();
      fake.comment.findUnique.mockResolvedValue(prismaRow({ id: 'internal-1' }));
      const comment = await buildRepository(fake).findCommentById('internal-1');
      expect(comment).toMatchObject({
        id: 'internal-1',
        postId: 'post-1',
        platform: 'FACEBOOK',
        externalId: 'c1',
        parentCommentId: null,
      });
    });
  });

  describe('upsertComments', () => {
    it('returns an empty array without touching the database for an empty page', async () => {
      const fake = buildFakePrisma();
      const rows = await buildRepository(fake).upsertComments({ post, comments: [] });
      expect(rows).toEqual([]);
      expect(fake.$transaction).not.toHaveBeenCalled();
      expect(fake.comment.findMany).not.toHaveBeenCalled();
    });

    it('upserts each comment then returns the cached rows mapped to domain', async () => {
      const fake = buildFakePrisma();
      fake.comment.findMany.mockResolvedValue([prismaRow({ id: 'internal-1', externalId: 'c1' })]);
      const rows = await buildRepository(fake).upsertComments({
        post,
        comments: [fetched({ externalId: 'c1' })],
      });
      expect(fake.comment.upsert).toHaveBeenCalledTimes(1);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: 'internal-1', externalId: 'c1', platform: 'FACEBOOK' });
    });

    it('resolves parent external ids and threads replies in a second pass', async () => {
      const fake = buildFakePrisma();
      // Pass 2 parent lookup resolves 'parent' -> 'internal-parent'.
      fake.comment.findMany
        .mockResolvedValueOnce([{ id: 'internal-parent', externalId: 'parent' }])
        .mockResolvedValueOnce([
          prismaRow({ id: 'internal-parent', externalId: 'parent' }),
          prismaRow({
            id: 'internal-child',
            externalId: 'child',
            parentCommentId: 'internal-parent',
          }),
        ]);

      const rows = await buildRepository(fake).upsertComments({
        post,
        comments: [
          fetched({ externalId: 'parent' }),
          fetched({ externalId: 'child', parentExternalId: 'parent' }),
        ],
      });

      expect(fake.comment.update).toHaveBeenCalledWith({
        where: { platform_externalId: { platform: 'FACEBOOK', externalId: 'child' } },
        data: { parentCommentId: 'internal-parent' },
      });
      const child = rows.find((row) => row.externalId === 'child');
      expect(child?.parentCommentId).toBe('internal-parent');
    });

    it('does not issue threading updates when the parent is not resolvable', async () => {
      const fake = buildFakePrisma();
      fake.comment.findMany
        .mockResolvedValueOnce([]) // parent lookup finds nothing
        .mockResolvedValueOnce([prismaRow({ id: 'internal-child', externalId: 'child' })]);

      await buildRepository(fake).upsertComments({
        post,
        comments: [fetched({ externalId: 'child', parentExternalId: 'absent' })],
      });

      expect(fake.comment.update).not.toHaveBeenCalled();
    });
  });

  describe('upsertComment', () => {
    it('upserts a single reply and maps the result to domain', async () => {
      const fake = buildFakePrisma();
      fake.comment.upsert.mockResolvedValue(
        prismaRow({ id: 'reply-internal', externalId: 'reply-1', parentCommentId: 'internal-parent' }),
      );
      const reply = await buildRepository(fake).upsertComment({
        post,
        externalId: 'reply-1',
        authorHandle: 'me',
        content: 'thanks',
        parentCommentId: 'internal-parent',
        createdAt: new Date('2026-01-04T00:00:00Z'),
      });
      expect(reply).toMatchObject({
        id: 'reply-internal',
        externalId: 'reply-1',
        parentCommentId: 'internal-parent',
      });
    });
  });
});
