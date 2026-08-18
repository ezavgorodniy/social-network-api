// Request validation schemas for the comments endpoints (see PLAN.md REST API).
//
// zod parses/validates at the HTTP boundary; the `ZodValidationPipe` runs these
// and throws `InvalidRequestError` (400) on failure. Query values arrive as
// strings, so `limit` is coerced. The inferred output types are what the
// controller hands to the service.

import { z } from 'zod';

const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const MAX_CONTENT_LENGTH = 8000;

/** `GET /posts/:postId/comments?limit&cursor` query. */
export const listCommentsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int('limit must be an integer')
    .min(MIN_LIMIT, `limit must be at least ${MIN_LIMIT}`)
    .max(MAX_LIMIT, `limit must be at most ${MAX_LIMIT}`)
    .default(DEFAULT_LIMIT),
  cursor: z.string().min(1, 'cursor must not be empty').optional(),
});

export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;

/** `POST /comments/:commentId/replies` body. */
export const createReplyBodySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'content must not be empty')
    .max(MAX_CONTENT_LENGTH, `content must be at most ${MAX_CONTENT_LENGTH} characters`),
});

export type CreateReplyBody = z.infer<typeof createReplyBodySchema>;
