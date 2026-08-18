import type { Comment, Post } from '@app/domain/comment';
import { CommentNotFoundError, PostNotFoundError } from '@app/domain/errors';
import { CommentService } from '@app/comments/comment-service';
import { PlatformAdapterRegistry } from '@app/platforms/platform-adapter-registry';
import type { PlatformAdapter } from '@app/platforms/platform-adapter';
import type { CommentRepository } from '@app/repositories/comment-repository';

const post: Post = {
  id: 'post-1',
  platform: 'FACEBOOK',
  externalId: 'fb-post-1',
  publishedAt: new Date('2026-01-01T00:00:00Z'),
};

function comment(overrides: Partial<Comment> & { id: string }): Comment {
  return {
    postId: 'post-1',
    platform: 'FACEBOOK',
    externalId: 'c1',
    authorHandle: 'alice',
    content: 'hello',
    parentCommentId: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    syncedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

interface FakeRepository {
  findPostById: jest.Mock;
  findCommentById: jest.Mock;
  upsertComments: jest.Mock;
  upsertComment: jest.Mock;
}

function buildRepository(): FakeRepository {
  return {
    findPostById: jest.fn(),
    findCommentById: jest.fn(),
    upsertComments: jest.fn(),
    upsertComment: jest.fn(),
  };
}

function buildAdapter(): jest.Mocked<PlatformAdapter> {
  return {
    platform: 'FACEBOOK',
    fetchComments: jest.fn(),
    postReply: jest.fn(),
  };
}

function buildService(
  repository: FakeRepository,
  adapter: PlatformAdapter,
): CommentService {
  const registry = new PlatformAdapterRegistry([adapter]);
  return new CommentService(repository as unknown as CommentRepository, registry);
}

describe('CommentService', () => {
  describe('getComments', () => {
    it('throws PostNotFoundError when the post is unknown', async () => {
      const repository = buildRepository();
      repository.findPostById.mockResolvedValue(null);
      const service = buildService(repository, buildAdapter());

      await expect(service.getComments('missing', { limit: 25 })).rejects.toBeInstanceOf(
        PostNotFoundError,
      );
    });

    it('fetches from the adapter, caches the page, and returns rows plus cursor', async () => {
      const repository = buildRepository();
      repository.findPostById.mockResolvedValue(post);
      const cached = [comment({ id: 'internal-1' })];
      repository.upsertComments.mockResolvedValue(cached);

      const adapter = buildAdapter();
      adapter.fetchComments.mockResolvedValue({
        comments: [
          {
            externalId: 'c1',
            authorHandle: 'alice',
            content: 'hello',
            parentExternalId: null,
            createdAt: new Date('2026-01-02T00:00:00Z'),
          },
        ],
        nextCursor: 'cursor-next',
      });

      const service = buildService(repository, adapter);
      const result = await service.getComments('post-1', { limit: 10, cursor: 'cursor-prev' });

      expect(adapter.fetchComments).toHaveBeenCalledWith('fb-post-1', {
        limit: 10,
        cursor: 'cursor-prev',
      });
      expect(repository.upsertComments).toHaveBeenCalledWith({
        post,
        comments: [
          expect.objectContaining({ externalId: 'c1' }),
        ],
      });
      expect(result).toEqual({ comments: cached, nextCursor: 'cursor-next' });
    });
  });

  describe('replyToComment', () => {
    it('throws CommentNotFoundError when the parent comment is unknown', async () => {
      const repository = buildRepository();
      repository.findCommentById.mockResolvedValue(null);
      const service = buildService(repository, buildAdapter());

      await expect(service.replyToComment('missing', 'hi')).rejects.toBeInstanceOf(
        CommentNotFoundError,
      );
    });

    it('throws PostNotFoundError when the parent references a missing post', async () => {
      const repository = buildRepository();
      repository.findCommentById.mockResolvedValue(comment({ id: 'internal-parent' }));
      repository.findPostById.mockResolvedValue(null);
      const service = buildService(repository, buildAdapter());

      await expect(service.replyToComment('internal-parent', 'hi')).rejects.toBeInstanceOf(
        PostNotFoundError,
      );
    });

    it('posts via the adapter and persists the reply threaded under the parent', async () => {
      const repository = buildRepository();
      repository.findCommentById.mockResolvedValue(comment({ id: 'internal-parent', externalId: 'parent-ext' }));
      repository.findPostById.mockResolvedValue(post);
      const persisted = comment({ id: 'reply-internal', externalId: 'reply-ext', parentCommentId: 'internal-parent' });
      repository.upsertComment.mockResolvedValue(persisted);

      const adapter = buildAdapter();
      adapter.postReply.mockResolvedValue({
        externalId: 'reply-ext',
        authorHandle: 'me',
        content: 'thanks',
        parentExternalId: 'parent-ext',
        createdAt: new Date('2026-01-04T00:00:00Z'),
      });

      const service = buildService(repository, adapter);
      const result = await service.replyToComment('internal-parent', 'thanks');

      expect(adapter.postReply).toHaveBeenCalledWith('parent-ext', 'thanks');
      expect(repository.upsertComment).toHaveBeenCalledWith({
        post,
        externalId: 'reply-ext',
        authorHandle: 'me',
        content: 'thanks',
        parentCommentId: 'internal-parent',
        createdAt: new Date('2026-01-04T00:00:00Z'),
      });
      expect(result).toBe(persisted);
    });
  });
});
