import { Module } from '@nestjs/common';

import { PrismaModule } from '@app/prisma/prisma.module';
import { COMMENT_REPOSITORY } from './comment-repository';
import { PrismaCommentRepository } from './prisma-comment-repository';

/**
 * Binds the production `CommentRepository` (Prisma-backed) behind its injection
 * token and exports it. Tests substitute `InMemoryCommentRepository` via Nest's
 * testing module rather than importing this module (see ADR 0005).
 */
@Module({
  imports: [PrismaModule],
  providers: [{ provide: COMMENT_REPOSITORY, useClass: PrismaCommentRepository }],
  exports: [COMMENT_REPOSITORY],
})
export class RepositoriesModule {}
