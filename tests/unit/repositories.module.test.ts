import { Test } from '@nestjs/testing';

import { COMMENT_REPOSITORY } from '@app/repositories/comment-repository';
import { PrismaCommentRepository } from '@app/repositories/prisma-comment-repository';
import { RepositoriesModule } from '@app/repositories/repositories.module';
import { PrismaService } from '@app/prisma/prisma.service';

describe('RepositoriesModule', () => {
  it('binds COMMENT_REPOSITORY to the Prisma implementation', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [RepositoriesModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(COMMENT_REPOSITORY)).toBeInstanceOf(PrismaCommentRepository);
  });
});
