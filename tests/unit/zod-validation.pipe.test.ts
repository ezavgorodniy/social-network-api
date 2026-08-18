import { z } from 'zod';

import { InvalidRequestError } from '@app/domain/errors';
import { ZodValidationPipe } from '@app/common/zod-validation.pipe';

const schema = z.object({
  limit: z.number().int().min(1),
  cursor: z.string().optional(),
});

describe('ZodValidationPipe', () => {
  it('returns the parsed value when validation succeeds', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ limit: 5 })).toEqual({ limit: 5 });
  });

  it('throws InvalidRequestError naming the failing field', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({ limit: 0 })).toThrow(InvalidRequestError);
    expect(() => pipe.transform({ limit: 0 })).toThrow(/limit/);
  });

  it('labels a root-level failure as (root)', () => {
    const pipe = new ZodValidationPipe(z.string());
    expect(() => pipe.transform(42)).toThrow(/\(root\)/);
  });

  it('joins multiple issues into one message', () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ limit: 'x', cursor: 5 });
      throw new Error('expected pipe to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRequestError);
      expect((error as InvalidRequestError).message).toContain(';');
    }
  });
});
