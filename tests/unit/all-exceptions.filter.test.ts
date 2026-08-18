import { HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';

import { AllExceptionsFilter } from '@app/common/all-exceptions.filter';
import { PostNotFoundError } from '@app/domain/errors';

interface CapturedResponse {
  statusCode: number | null;
  body: unknown;
  status: jest.Mock;
  json: jest.Mock;
}

function buildResponse(): CapturedResponse {
  const captured: CapturedResponse = {
    statusCode: null,
    body: null,
    status: jest.fn(),
    json: jest.fn(),
  };
  captured.status.mockImplementation((code: number) => {
    captured.statusCode = code;
    return captured;
  });
  captured.json.mockImplementation((body: unknown) => {
    captured.body = body;
    return captured;
  });
  return captured;
}

function hostFor(response: CapturedResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let response: CapturedResponse;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    response = buildResponse();
  });

  it('renders a DomainError using its code, status, and message', () => {
    filter.catch(new PostNotFoundError('post-1'), hostFor(response));

    expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(response.body).toEqual({
      error: { code: 'POST_NOT_FOUND', message: 'Post not found: post-1' },
    });
  });

  it('renders an HttpException with a status-derived code', () => {
    filter.catch(new HttpException('Not Found', HttpStatus.NOT_FOUND), hostFor(response));

    expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not Found' } });
  });

  it('renders a generic 500 for an unexpected Error and logs the stack', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const boom = new Error('database exploded');

    filter.catch(boom, hostFor(response));

    expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    // The real cause is logged server-side; the client body never carries it.
    expect(logSpy).toHaveBeenCalledWith('Unhandled exception', boom.stack);
    logSpy.mockRestore();
  });

  it('logs a stringified value when a non-Error is thrown', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    filter.catch('plain string failure', hostFor(response));

    expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(logSpy).toHaveBeenCalledWith('Unhandled exception', 'plain string failure');
    logSpy.mockRestore();
  });

  it('falls back to the error message when an Error has no stack', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const stackless = new Error('no stack here');
    stackless.stack = undefined;

    filter.catch(stackless, hostFor(response));

    expect(logSpy).toHaveBeenCalledWith('Unhandled exception', 'no stack here');
    logSpy.mockRestore();
  });

  it('falls back to HTTP_<status> for a status with no named code', () => {
    // 299 has no entry in Nest's HttpStatus enum, so the reverse lookup misses.
    filter.catch(new HttpException('Unusual', 299), hostFor(response));

    expect(response.statusCode).toBe(299);
    expect(response.body).toEqual({ error: { code: 'HTTP_299', message: 'Unusual' } });
  });
});
