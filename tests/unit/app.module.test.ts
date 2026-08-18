import { Test } from '@nestjs/testing';

import { AppModule } from '@app/app.module';
import { CommentsController } from '@app/comments/comments.controller';
import { PrismaService } from '@app/prisma/prisma.service';
import { TOKEN_PROVIDER } from '@app/auth/token-provider';

describe('AppModule', () => {
  it('composes the app so the comments controller resolves from its seams', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Substitute the boundary providers so no real DB or request context is needed.
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(TOKEN_PROVIDER)
      .useValue({ getToken: () => 'test-token' })
      .compile();

    // Compiling AppModule proves the global APP_FILTER binding is valid (Nest
    // instantiates enhancer providers during compile); the filter's own behaviour
    // is covered by all-exceptions.filter.test.ts.
    expect(moduleRef.get(CommentsController)).toBeInstanceOf(CommentsController);
  });
});
