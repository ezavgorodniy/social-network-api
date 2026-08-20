// Development seed: inserts one published Post so `GET /posts/:postId/comments`
// has an anchor to resolve. This slice has no "publish a post" endpoint (posts
// are assumed created by the wider scheduling product), so a reviewer needs a
// Post row to exercise the API. See docs/adrs/0009-persist-posts-cache-comments.md.
//
// Idempotent: upserts on the fixed id so re-running is safe. Set SEED_POST_EXTERNAL_ID
// to your own Facebook post id ({page-id}_{post-id}); otherwise a placeholder is
// used (the live GET will 502 against it until you point it at a real post).
//
// Run with: npm run seed

import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

loadEnv();

const SEED_POST_ID = 'post_test_1';
const DEFAULT_EXTERNAL_ID = '000000000000000_000000000000000';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === '') {
    throw new Error('DATABASE_URL must be set to seed the database');
  }

  const externalId = process.env.SEED_POST_EXTERNAL_ID ?? DEFAULT_EXTERNAL_ID;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const post = await prisma.post.upsert({
      where: { id: SEED_POST_ID },
      create: {
        id: SEED_POST_ID,
        platform: 'FACEBOOK',
        externalId,
        publishedAt: new Date(),
      },
      update: { externalId },
    });

    console.log(`Seeded Post id=${post.id} platform=${post.platform} externalId=${post.externalId}`);
    if (externalId === DEFAULT_EXTERNAL_ID) {
      console.log(
        'NOTE: externalId is a placeholder. Set SEED_POST_EXTERNAL_ID=<{page-id}_{post-id}> ' +
          'to a real Facebook post before calling GET .../comments against the live API.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed failed: ${message}`);
  process.exitCode = 1;
});
