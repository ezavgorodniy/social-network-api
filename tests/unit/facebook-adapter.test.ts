import { UpstreamPlatformError } from '@app/domain/errors';
import { FacebookAdapter } from '@app/platforms/facebook-adapter';
import type { HttpClient, HttpRequest, HttpResponse } from '@app/http-client/http-client';
import type { TokenProvider } from '@app/auth/token-provider';

function jsonResponse(body: unknown, status = 200): HttpResponse {
  return { status, ok: status >= 200 && status < 300, body: JSON.stringify(body) };
}

function buildAdapter(sendMock: jest.Mock): FacebookAdapter {
  const httpClient: HttpClient = { send: sendMock };
  const tokenProvider: TokenProvider = { getToken: () => 'test-token' };
  return new FacebookAdapter(httpClient, tokenProvider);
}

describe('FacebookAdapter.fetchComments', () => {
  it('requests the Graph API with bearer auth, limit, order, and maps comments', async () => {
    const send = jest.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'c1',
            message: 'hello',
            created_time: '2026-01-01T00:00:00Z',
            from: { name: 'Alice' },
            parent: { id: 'p1' },
          },
        ],
        paging: { next: 'https://next', cursors: { after: 'CURSOR2' } },
      }),
    );
    const adapter = buildAdapter(send);

    const page = await adapter.fetchComments('post-123', { limit: 20 });

    const request = send.mock.calls[0][0] as HttpRequest;
    expect(request.method).toBe('GET');
    expect(request.url).toContain('/post-123/comments');
    expect(request.url).toContain('limit=20');
    expect(request.url).toContain('order=chronological');
    expect(request.headers).toEqual({ Authorization: 'Bearer test-token' });
    expect(page.comments).toEqual([
      {
        externalId: 'c1',
        authorHandle: 'Alice',
        content: 'hello',
        parentExternalId: 'p1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    expect(page.nextCursor).toBe('CURSOR2');
  });

  it('forwards an opaque cursor as the `after` parameter', async () => {
    const send = jest.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const adapter = buildAdapter(send);

    await adapter.fetchComments('post-123', { limit: 5, cursor: 'PREV' });

    const request = send.mock.calls[0][0] as HttpRequest;
    expect(request.url).toContain('after=PREV');
  });

  it('returns nextCursor null when there is no further page', async () => {
    const send = jest.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const page = await buildAdapter(send).fetchComments('post-123', { limit: 20 });
    expect(page.nextCursor).toBeNull();
  });

  it('returns nextCursor null when a next page exists but carries no after cursor', async () => {
    const send = jest.fn().mockResolvedValue(
      jsonResponse({ data: [], paging: { next: 'https://next' } }),
    );
    const page = await buildAdapter(send).fetchComments('post-123', { limit: 20 });
    expect(page.nextCursor).toBeNull();
  });

  it('defaults missing optional comment fields', async () => {
    const send = jest.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'c2' }] }));
    const page = await buildAdapter(send).fetchComments('post-123', { limit: 20 });
    const comment = page.comments[0];
    expect(comment).toMatchObject({
      externalId: 'c2',
      authorHandle: '',
      content: '',
      parentExternalId: null,
    });
    expect(comment?.createdAt).toBeInstanceOf(Date);
  });

  it('treats a missing data array as an empty page', async () => {
    const send = jest.fn().mockResolvedValue(jsonResponse({}));
    const page = await buildAdapter(send).fetchComments('post-123', { limit: 20 });
    expect(page.comments).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('maps a non-2xx Graph response to UpstreamPlatformError', async () => {
    const send = jest.fn().mockResolvedValue(jsonResponse({ error: 'bad' }, 400));
    await expect(buildAdapter(send).fetchComments('post-123', { limit: 20 })).rejects.toBeInstanceOf(
      UpstreamPlatformError,
    );
  });

  it('maps a non-JSON Graph response to UpstreamPlatformError', async () => {
    const send = jest.fn().mockResolvedValue({ status: 200, ok: true, body: 'not json' });
    await expect(buildAdapter(send).fetchComments('post-123', { limit: 20 })).rejects.toBeInstanceOf(
      UpstreamPlatformError,
    );
  });
});

describe('FacebookAdapter.postReply', () => {
  it('posts the reply with a JSON body and returns the created comment', async () => {
    const send = jest.fn().mockResolvedValue(jsonResponse({ id: 'reply-1' }));
    const adapter = buildAdapter(send);

    const reply = await adapter.postReply('c1', 'thanks!');

    const request = send.mock.calls[0][0] as HttpRequest;
    expect(request.method).toBe('POST');
    expect(request.url).toContain('/c1/comments');
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(request.body ?? '{}')).toEqual({ message: 'thanks!' });
    expect(reply).toMatchObject({
      externalId: 'reply-1',
      content: 'thanks!',
      parentExternalId: 'c1',
    });
  });

  it('throws UpstreamPlatformError when the reply response has no id', async () => {
    const send = jest.fn().mockResolvedValue(jsonResponse({}));
    await expect(buildAdapter(send).postReply('c1', 'hi')).rejects.toBeInstanceOf(
      UpstreamPlatformError,
    );
  });

  it('maps a non-2xx reply response to UpstreamPlatformError', async () => {
    const send = jest.fn().mockResolvedValue(jsonResponse({}, 502));
    await expect(buildAdapter(send).postReply('c1', 'hi')).rejects.toBeInstanceOf(
      UpstreamPlatformError,
    );
  });
});
