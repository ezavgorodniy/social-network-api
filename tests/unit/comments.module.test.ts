import { Test } from '@nestjs/testing';

import { CommentService } from '@app/comments/comment-service';
import { CommentsController } from '@app/comments/comments.controller';
import { CommentsModule } from '@app/comments/comments.module';
import { PrismaService } from '@app/prisma/prisma.service';
import { TOKEN_PROVIDER } from '@app/auth/token-provider';

describe('CommentsModule', () => {
  it('wires the controller and service from its imported seams', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [CommentsModule] })
      // Substitute the boundary providers so no real DB or request context is needed.
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(TOKEN_PROVIDER)
      .useValue({ getToken: () => 'test-token' })
      .compile();

    expect(moduleRef.get(CommentsController)).toBeInstanceOf(CommentsController);
    expect(moduleRef.get(CommentService)).toBeInstanceOf(CommentService);
  });
});
