import type { Post } from '@app/domain/comment';
import { PrismaService } from '@app/prisma/prisma.service';
import { PrismaCommentRepository } from '@app/repositories/prisma-comment-repository';
import {
  runCommentRepositoryContract,
  type CommentRepositoryHarness,
} from '../support/comment-repository.contract';

/**
 * Integration coverage for `PrismaCommentRepository` against a REAL PostgreSQL
 * (see ADR 0008). It runs the same shared contract the in-memory double passes,
 * so the two implementations are proven to behave identically — but here backed
 * by the actual schema, unique constraints, and cascade relations.
 *
 * Requires a reachable database (`docker compose up -d db`, migrations applied).
 * If `DATABASE_URL` is unreachable the suite fails loudly rather than skipping,
 * so a missing database can never silently drop this coverage — CI always has
 * Postgres available.
 */
const prisma = new PrismaService();

const harness: CommentRepositoryHarness<PrismaCommentRepository> = {
  async createRepository(): Promise<PrismaCommentRepository> {
    // Truncate between tests for isolation; CASCADE clears comments via the FK.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Comment", "Post" RESTART IDENTITY CASCADE');
    return new PrismaCommentRepository(prisma);
  },
  async seedPost(_repository: PrismaCommentRepository, post: Post): Promise<void> {
    await prisma.post.create({
      data: {
        id: post.id,
        platform: post.platform,
        externalId: post.externalId,
        publishedAt: post.publishedAt,
      },
    });
  },
};

describe('PrismaCommentRepository (integration, real Postgres)', () => {
  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  runCommentRepositoryContract(harness);
});
