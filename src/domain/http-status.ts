// HTTP status codes used by domain errors.
//
// Defined here (rather than importing Nest's `HttpStatus`) so the domain layer
// stays free of framework types. The exception filter maps `DomainError.httpStatus`
// straight onto the HTTP response.

export const HttpStatus = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];
