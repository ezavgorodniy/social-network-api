import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * The application's PrismaClient, wired to PostgreSQL through the `@prisma/adapter-pg`
 * driver adapter (see ADR 0004, amended by ADR 0013). Prisma 7 no longer reads the
 * connection string from `schema.prisma`; the runtime supplies it here.
 *
 * The connection string comes from the environment only (never hardcoded); a
 * dedicated, validated config layer replaces this direct read in a later step.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined || connectionString === '') {
      throw new Error('DATABASE_URL must be set to connect to PostgreSQL');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
