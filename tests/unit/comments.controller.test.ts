import type { Comment } from '@app/domain/comment';
import { CommentService } from '@app/comments/comment-service';
import { CommentsController } from '@app/comments/comments.controller';

const comment: Comment = {
  id: 'internal-1',
  postId: 'post-1',
  platform: 'FACEBOOK',
  externalId: 'c1',
  authorHandle: 'alice',
  content: 'hello',
  parentCommentId: null,
  createdAt: new Date('2026-01-02T00:00:00Z'),
  syncedAt: new Date('2026-01-02T00:00:00Z'),
};

function buildController(service: Partial<CommentService>): CommentsController {
  return new CommentsController(service as CommentService);
}

describe('CommentsController', () => {
  describe('listComments', () => {
    it('delegates to the service and wraps the result in the list envelope', async () => {
      const getComments = jest
        .fn()
        .mockResolvedValue({ comments: [comment], nextCursor: 'next' });
      const controller = buildController({ getComments });

      const response = await controller.listComments('post-1', { limit: 10, cursor: 'prev' });

      expect(getComments).toHaveBeenCalledWith('post-1', { limit: 10, cursor: 'prev' });
      expect(response).toMatchObject({
        data: [expect.objectContaining({ id: 'internal-1' })],
        meta: { nextCursor: 'next' },
      });
    });
  });

  describe('createReply', () => {
    it('delegates to the service and wraps the reply in the reply envelope', async () => {
      const replyToComment = jest.fn().mockResolvedValue(comment);
      const controller = buildController({ replyToComment });

      const response = await controller.createReply('internal-parent', { content: 'thanks' });

      expect(replyToComment).toHaveBeenCalledWith('internal-parent', 'thanks');
      expect(response).toMatchObject({ data: expect.objectContaining({ id: 'internal-1' }) });
    });
  });
});
