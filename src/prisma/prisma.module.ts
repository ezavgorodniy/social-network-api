import { Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Provides the shared PrismaService. Kept separate from the repository module so
 * the client's lifecycle (connect/disconnect) is owned in one place.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
