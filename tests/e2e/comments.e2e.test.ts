import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@app/app.module';
import { PLATFORM_TOKEN_HEADER } from '@app/auth/token-provider';
import type { Post } from '@app/domain/comment';
import {
  HTTP_CLIENT,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
} from '@app/http-client/http-client';
import { COMMENT_REPOSITORY } from '@app/repositories/comment-repository';
import { InMemoryCommentRepository } from '../support/in-memory-comment-repository';

const post: Post = {
  id: 'post-1',
  platform: 'FACEBOOK',
  externalId: 'fb-post-1',
  publishedAt: new Date('2026-01-01T00:00:00Z'),
};

function graphResponse(body: unknown, status = 200): HttpResponse {
  return { status, ok: status >= 200 && status < 300, body: JSON.stringify(body) };
}

/**
 * End-to-end coverage of the HTTP surface (see ADR 0008). Boots the real
 * `AppModule` — so the global `/api/v1` prefix, the zod validation pipe, and the
 * `AllExceptionsFilter` all run — and overrides only the two boundaries: the
 * repository (in-memory, no DB) and the outbound `HttpClient` (a fake returning
 * canned Graph API JSON, so the REAL `FacebookAdapter` and `RequestScopedTokenProvider`
 * are exercised without any network call or live token).
 */
describe('Comments API (e2e)', () => {
  let app: INestApplication;
  let repository: InMemoryCommentRepository;
  let send: jest.Mock;
  const token = 'caller-supplied-token';

  beforeAll(async () => {
    repository = new InMemoryCommentRepository();
    send = jest.fn();
    const httpClient: HttpClient = { send };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(COMMENT_REPOSITORY)
      .useValue(repository)
      .overrideProvider(HTTP_CLIENT)
      .useValue(httpClient)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    send.mockReset();
    repository.seedPost(post);
  });

  describe('GET /api/v1/posts/:postId/comments', () => {
    it('returns 200 with the { data, meta } envelope', async () => {
      send.mockResolvedValue(
        graphResponse({
          data: [
            { id: 'c1', message: 'hello', created_time: '2026-01-02T00:00:00Z', from: { name: 'Alice' } },
          ],
          paging: { next: 'https://next', cursors: { after: 'CURSOR2' } },
        }),
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/posts/post-1/comments')
        .set(PLATFORM_TOKEN_HEADER, token)
        .expect(200);

      expect(response.body).toMatchObject({
        data: [expect.objectContaining({ externalId: 'c1', content: 'hello', platform: 'FACEBOOK' })],
        meta: { nextCursor: 'CURSOR2' },
      });
    });

    it('returns 404 with the error envelope for an unknown post', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/posts/does-not-exist/comments')
        .set(PLATFORM_TOKEN_HEADER, token)
        .expect(404);

      expect(response.body).toEqual({
        error: { code: 'POST_NOT_FOUND', message: 'Post not found: does-not-exist' },
      });
    });

    it('returns 400 for an out-of-range limit', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/posts/post-1/comments?limit=0')
        .set(PLATFORM_TOKEN_HEADER, token)
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('POST /api/v1/comments/:commentId/replies', () => {
    async function seedParentComment(): Promise<string> {
      const [parent] = await repository.upsertComments({
        post,
        comments: [
          {
            externalId: 'fb-c1',
            authorHandle: 'Alice',
            content: 'hello',
            parentExternalId: null,
            createdAt: new Date('2026-01-02T00:00:00Z'),
          },
        ],
      });
      return parent?.id ?? '';
    }

    it('returns 201 with the created reply after posting via the adapter', async () => {
      const parentId = await seedParentComment();
      send.mockResolvedValue(graphResponse({ id: 'fb-reply-1' }));

      const response = await request(app.getHttpServer())
        .post(`/api/v1/comments/${parentId}/replies`)
        .set(PLATFORM_TOKEN_HEADER, token)
        .send({ content: 'thanks!' })
        .expect(201);

      expect(response.body).toMatchObject({
        data: expect.objectContaining({ externalId: 'fb-reply-1', content: 'thanks!', parentCommentId: parentId }),
      });
      // The fake HttpClient received a real Graph POST carrying the bearer token.
      const graphRequest = send.mock.calls[0]?.[0] as HttpRequest;
      expect(graphRequest.method).toBe('POST');
      expect(graphRequest.headers?.Authorization).toBe(`Bearer ${token}`);
    });

    it('returns 400 for empty content', async () => {
      const parentId = await seedParentComment();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/comments/${parentId}/replies`)
        .set(PLATFORM_TOKEN_HEADER, token)
        .send({ content: '   ' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_REQUEST');
      expect(send).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown comment', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/comments/missing/replies')
        .set(PLATFORM_TOKEN_HEADER, token)
        .send({ content: 'hi' })
        .expect(404);

      expect(response.body.error.code).toBe('COMMENT_NOT_FOUND');
    });

    it('returns 401 when the X-Platform-Token header is missing', async () => {
      const parentId = await seedParentComment();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/comments/${parentId}/replies`)
        .send({ content: 'hi' })
        .expect(401);

      expect(response.body.error.code).toBe('MISSING_PLATFORM_TOKEN');
      expect(send).not.toHaveBeenCalled();
    });
  });
});
