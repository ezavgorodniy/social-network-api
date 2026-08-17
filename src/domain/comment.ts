// Core domain types for the comment system.
//
// These are intentionally hand-authored and independent of Prisma's generated
// types and of any HTTP/framework types. The repository maps Prisma rows to
// these shapes and adapters map platform payloads to them, so the service layer
// depends only on the domain (see ADR 0004, ADR 0005).

/**
 * The social platforms the system knows about. Kept as a `const` tuple so we get
 * both a runtime list (for validation and iteration) and a precise union type.
 * Mirrors the Prisma `Platform` enum by value; the repository validates the
 * mapping at the boundary rather than importing the generated enum here.
 */
export const PLATFORMS = ['FACEBOOK', 'TWITTER', 'INSTAGRAM', 'LINKEDIN'] as const;

export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

/**
 * A post published through this system: the anchor that maps our internal
 * `id` to the platform's own `(platform, externalId)` (see ADR 0009).
 */
export interface Post {
  readonly id: string;
  readonly platform: Platform;
  readonly externalId: string;
  readonly publishedAt: Date;
}

/**
 * A comment on a post. Stored as a cache/projection of platform-owned data
 * (see ADR 0009); `syncedAt` records when we last refreshed it from the
 * platform. Replies are threaded via `parentCommentId`.
 */
export interface Comment {
  readonly id: string;
  readonly postId: string;
  readonly platform: Platform;
  readonly externalId: string;
  readonly authorHandle: string;
  readonly content: string;
  readonly parentCommentId: string | null;
  readonly createdAt: Date;
  readonly syncedAt: Date;
}
