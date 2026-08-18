import type { Comment } from '@app/domain/comment';
import {
  createReplyBodySchema,
  listCommentsQuerySchema,
} from '@app/comments/dto/request';
import {
  toCreateReplyResponse,
  toListCommentsResponse,
} from '@app/comments/dto/response';

const comment: Comment = {
  id: 'internal-1',
  postId: 'post-1',
  platform: 'FACEBOOK',
  externalId: 'c1',
  authorHandle: 'alice',
  content: 'hello',
  parentCommentId: null,
  createdAt: new Date('2026-01-02T03:04:05Z'),
  syncedAt: new Date('2026-01-02T06:07:08Z'),
};

describe('listCommentsQuerySchema', () => {
  it('defaults limit to 25 when absent', () => {
    expect(listCommentsQuerySchema.parse({})).toEqual({ limit: 25 });
  });

  it('coerces a string limit to a number', () => {
    expect(listCommentsQuerySchema.parse({ limit: '10' })).toMatchObject({ limit: 10 });
  });

  it('accepts a cursor alongside limit', () => {
    expect(listCommentsQuerySchema.parse({ limit: '5', cursor: 'abc' })).toEqual({
      limit: 5,
      cursor: 'abc',
    });
  });

  it.each([['0'], ['101'], ['1.5'], ['nope']])('rejects invalid limit %p', (limit) => {
    expect(listCommentsQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it('rejects an empty cursor', () => {
    expect(listCommentsQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });
});

describe('createReplyBodySchema', () => {
  it('accepts and trims valid content', () => {
    expect(createReplyBodySchema.parse({ content: '  hi  ' })).toEqual({ content: 'hi' });
  });

  it('rejects empty or whitespace-only content', () => {
    expect(createReplyBodySchema.safeParse({ content: '   ' }).success).toBe(false);
  });

  it('rejects content over the length limit', () => {
    expect(createReplyBodySchema.safeParse({ content: 'a'.repeat(8001) }).success).toBe(false);
  });

  it('rejects a missing content field', () => {
    expect(createReplyBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('response mappers', () => {
  it('serializes a comment with ISO date strings inside the list envelope', () => {
    expect(toListCommentsResponse([comment], 'cursor-next')).toEqual({
      data: [
        {
          id: 'internal-1',
          postId: 'post-1',
          platform: 'FACEBOOK',
          externalId: 'c1',
          authorHandle: 'alice',
          content: 'hello',
          parentCommentId: null,
          createdAt: '2026-01-02T03:04:05.000Z',
          syncedAt: '2026-01-02T06:07:08.000Z',
        },
      ],
      meta: { nextCursor: 'cursor-next' },
    });
  });

  it('carries a null cursor through the list envelope', () => {
    expect(toListCommentsResponse([], null)).toEqual({ data: [], meta: { nextCursor: null } });
  });

  it('wraps a single reply in the reply envelope', () => {
    expect(toCreateReplyResponse(comment)).toEqual({
      data: expect.objectContaining({ id: 'internal-1', createdAt: '2026-01-02T03:04:05.000Z' }),
    });
  });
});
