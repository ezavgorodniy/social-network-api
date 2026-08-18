import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { DomainError } from '@app/domain/errors';

/** The single error shape every failed response carries (see docs/README.md). */
interface ErrorEnvelope {
  readonly error: { readonly code: string; readonly message: string };
}

/**
 * The minimal HTTP-response surface the filter writes to. Typed structurally so
 * the filter needs no `@types/express` dependency; any platform response with
 * this chainable `status().json()` shape satisfies it.
 */
interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: ErrorEnvelope): unknown;
}

/**
 * Renders every uncaught error into the shared envelope
 * `{ "error": { "code", "message" } }`. Three cases:
 *
 * - `DomainError` — an expected use-case failure; use its stable `code`,
 *   `httpStatus`, and `message` verbatim.
 * - `HttpException` — a framework error (e.g. a 404 for an unmatched route); use
 *   its status and a status-derived code.
 * - anything else — an unexpected bug; return a generic 500 that never leaks
 *   internals, and log the real cause server-side for diagnosis.
 *
 * Only unexpected errors are logged. Expected domain/HTTP errors are normal
 * client outcomes, not incidents, so logging them would be noise. The request
 * (and therefore the `X-Platform-Token` header) is never logged (see ADR 0007).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const { status, envelope } = this.resolve(exception);
    response.status(status).json(envelope);
  }

  private resolve(exception: unknown): { status: number; envelope: ErrorEnvelope } {
    if (exception instanceof DomainError) {
      return {
        status: exception.httpStatus,
        envelope: { error: { code: exception.code, message: exception.message } },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        envelope: { error: { code: this.codeForStatus(status), message: exception.message } },
      };
    }

    // Unexpected: log the real cause, return a generic body so nothing leaks.
    this.logger.error('Unhandled exception', this.describe(exception));
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      envelope: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    };
  }

  /** Maps an HTTP status number to a stable screaming-snake-case code. */
  private codeForStatus(status: number): string {
    return HttpStatus[status] ?? `HTTP_${status}`;
  }

  /** A loggable description of an unknown throwable, preserving the stack when present. */
  private describe(exception: unknown): string {
    return exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
  }
}
