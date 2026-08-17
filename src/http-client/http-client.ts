// Outbound HTTP seam.
//
// Adapters depend on `HttpClient`, never on a concrete HTTP library, so the client
// is swappable (see ADR 0010). The real implementation uses Node's native `fetch`;
// tests bind a mock. The interface exposes only what adapters need.

/** Nest injection token: interfaces are erased at runtime, so we bind by symbol. */
export const HTTP_CLIENT = Symbol('HttpClient');

export type HttpMethod = 'GET' | 'POST' | 'DELETE';

export interface HttpRequest {
  readonly method: HttpMethod;
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Serialised request body (adapters JSON-encode before calling). */
  readonly body?: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  /** Raw response body text; adapters parse it (e.g. JSON) as needed. */
  readonly body: string;
}

export interface HttpClient {
  send(request: HttpRequest): Promise<HttpResponse>;
}
