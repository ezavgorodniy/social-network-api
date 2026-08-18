import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { InvalidRequestError } from '@app/domain/errors';

/**
 * Validates and parses an incoming value against a zod schema at the HTTP
 * boundary, returning the schema's typed output. On failure it throws the domain
 * `InvalidRequestError` (HTTP 400) so the exception filter renders it in the
 * shared error envelope — the pipe never leaks zod's own error shape outward.
 *
 * Bound per route argument (e.g. `@Query(new ZodValidationPipe(schema))`), so it
 * is stateless and can be reused across controllers.
 */
@Injectable()
export class ZodValidationPipe<Output> implements PipeTransform<unknown, Output> {
  constructor(private readonly schema: ZodType<Output>) {}

  transform(value: unknown): Output {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new InvalidRequestError(this.formatIssues(result.error.issues));
    }
    return result.data;
  }

  private formatIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
    return issues
      .map((issue) => {
        const location = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `${location}: ${issue.message}`;
      })
      .join('; ');
  }
}
