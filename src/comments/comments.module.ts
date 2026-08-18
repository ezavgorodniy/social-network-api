import { Module } from '@nestjs/common';

import { PlatformsModule } from '@app/platforms/platforms.module';
import { RepositoriesModule } from '@app/repositories/repositories.module';
import { CommentService } from './comment-service';
import { CommentsController } from './comments.controller';

/**
 * The comments feature slice: the controller, the service, and the two seams it
 * orchestrates — `RepositoriesModule` (the `CommentRepository` token) and
 * `PlatformsModule` (the `PlatformAdapterRegistry`). Both are imported for their
 * exported providers; this module owns no persistence or platform detail itself.
 */
@Module({
  imports: [RepositoriesModule, PlatformsModule],
  controllers: [CommentsController],
  providers: [CommentService],
})
export class CommentsModule {}
