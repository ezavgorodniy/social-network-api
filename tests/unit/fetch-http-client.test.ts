import { FetchHttpClient } from '@app/http-client/fetch-http-client';

describe('FetchHttpClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('forwards method, url, headers, and body to fetch and maps the response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response('{"data":[]}', { status: 200 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new FetchHttpClient();
    const response = await client.send({
      method: 'POST',
      url: 'https://graph.example/comments',
      headers: { Authorization: 'Bearer token' },
      body: '{"message":"hi"}',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://graph.example/comments', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: '{"message":"hi"}',
    });
    expect(response).toEqual({ status: 200, ok: true, body: '{"data":[]}' });
  });

  it('reports ok=false for non-2xx responses while returning the body', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('nope', { status: 502 })) as unknown as typeof fetch;

    const client = new FetchHttpClient();
    const response = await client.send({ method: 'GET', url: 'https://graph.example/x' });

    expect(response).toEqual({ status: 502, ok: false, body: 'nope' });
  });

  it('propagates transport errors from fetch', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const client = new FetchHttpClient();
    await expect(client.send({ method: 'GET', url: 'https://graph.example/x' })).rejects.toThrow(
      'network down',
    );
  });
});
