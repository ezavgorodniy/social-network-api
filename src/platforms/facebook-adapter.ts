import { Inject, Injectable } from '@nestjs/common';

import type { Platform } from '@app/domain/comment';
import { UpstreamPlatformError } from '@app/domain/errors';
import { TOKEN_PROVIDER, type TokenProvider } from '@app/auth/token-provider';
import { HTTP_CLIENT, type HttpClient, type HttpResponse } from '@app/http-client/http-client';
import type {
  FetchCommentsOptions,
  PlatformAdapter,
  PlatformComment,
  PlatformCommentPage,
} from './platform-adapter';

const GRAPH_API_BASE_URL = 'https://graph.facebook.com/v21.0';

/** Shape of a single comment node in a Graph API `/comments` response. */
interface GraphComment {
  id: string;
  message?: string;
  created_time?: string;
  from?: { name?: string; id?: string };
  parent?: { id?: string };
}

interface GraphCommentsResponse {
  data?: GraphComment[];
  paging?: { cursors?: { after?: string }; next?: string };
}

interface GraphReplyResponse {
  id?: string;
}

/**
 * Facebook Graph API adapter (the one fully-implemented platform, see ADR 0006).
 * Authenticates with the caller-supplied bearer token via `TokenProvider` (ADR 0007)
 * and makes outbound calls through `HttpClient` (ADR 0010). Graph API failures are
 * mapped to `UpstreamPlatformError` (HTTP 502).
 */
@Injectable()
export class FacebookAdapter implements PlatformAdapter {
  readonly platform: Platform = 'FACEBOOK';

  constructor(
    @Inject(HTTP_CLIENT) private readonly httpClient: HttpClient,
    @Inject(TOKEN_PROVIDER) private readonly tokenProvider: TokenProvider,
  ) {}

  async fetchComments(
    postExternalId: string,
    options: FetchCommentsOptions,
  ): Promise<PlatformCommentPage> {
    const query = new URLSearchParams({
      fields: 'id,message,created_time,from,parent',
      limit: String(options.limit),
      order: 'chronological',
    });
    if (options.cursor !== undefined) {
      query.set('after', options.cursor);
    }

    const response = await this.httpClient.send({
      method: 'GET',
      url: `${GRAPH_API_BASE_URL}/${encodeURIComponent(postExternalId)}/comments?${query.toString()}`,
      headers: this.authHeaders(),
    });

    const parsed = this.parseResponse<GraphCommentsResponse>(response);
    const comments = (parsed.data ?? []).map((node) => this.toPlatformComment(node));

    return {
      comments,
      nextCursor: parsed.paging?.next !== undefined ? (parsed.paging.cursors?.after ?? null) : null,
    };
  }

  async postReply(
    parentCommentExternalId: string,
    content: string,
  ): Promise<PlatformComment> {
    const response = await this.httpClient.send({
      method: 'POST',
      url: `${GRAPH_API_BASE_URL}/${encodeURIComponent(parentCommentExternalId)}/comments`,
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content }),
    });

    const created = this.parseResponse<GraphReplyResponse>(response);
    if (created.id === undefined) {
      throw new UpstreamPlatformError(this.platform, 'reply response missing comment id');
    }

    // The Graph create-comment response returns only the new id, not the full
    // comment, so we echo back the content we sent, threaded under the parent.
    // authorHandle is left empty because the response does not include it.
    // TODO: populate authorHandle (and the real created_time) by issuing a
    // follow-up GET /{comment-id}?fields=from,message,created_time, or by
    // requesting those fields on the create call if the Graph version supports it.
    // Deferred to avoid a second round-trip in the vertical slice; a subsequent
    // fetchComments refreshes the cached reply with the real author anyway.
    return {
      externalId: created.id,
      authorHandle: '',
      content,
      parentExternalId: parentCommentExternalId,
      createdAt: new Date(),
    };
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.tokenProvider.getToken()}` };
  }

  private parseResponse<T>(response: HttpResponse): T {
    if (!response.ok) {
      throw new UpstreamPlatformError(
        this.platform,
        `Graph API returned status ${response.status}`,
      );
    }
    try {
      return JSON.parse(response.body) as T;
    } catch {
      throw new UpstreamPlatformError(this.platform, 'Graph API returned a non-JSON response');
    }
  }

  private toPlatformComment(node: GraphComment): PlatformComment {
    return {
      externalId: node.id,
      authorHandle: node.from?.name ?? '',
      content: node.message ?? '',
      parentExternalId: node.parent?.id ?? null,
      createdAt: node.created_time !== undefined ? new Date(node.created_time) : new Date(),
    };
  }
}
