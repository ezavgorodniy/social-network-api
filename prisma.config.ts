// Prisma 7 configuration.
//
// Prisma 7 removed `url` from the datasource block in schema.prisma and no
// longer auto-loads `.env`. Connection details live here instead:
//   - `datasource.url` is what the Prisma CLI uses for migrate / introspect /
//     studio (schema-engine) commands.
//   - The application runtime does NOT read this; it constructs PrismaClient
//     with the `@prisma/adapter-pg` driver adapter (see ADR 0004).
//
// We explicitly load `.env` because Prisma 7 dropped built-in dotenv support.

import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from '@prisma/config';

loadEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
