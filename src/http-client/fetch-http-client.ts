import { Injectable } from '@nestjs/common';

import type { HttpClient, HttpRequest, HttpResponse } from './http-client';

/**
 * Real `HttpClient` backed by Node's native global `fetch` (see ADR 0010). No HTTP
 * library dependency. Network/transport failures are surfaced to the caller; the
 * platform adapter maps them to a domain `UpstreamPlatformError`.
 */
@Injectable()
export class FetchHttpClient implements HttpClient {
  async send(request: HttpRequest): Promise<HttpResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    const body = await response.text();

    return {
      status: response.status,
      ok: response.ok,
      body,
    };
  }
}
