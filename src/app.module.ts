import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';

import { CommentsModule } from '@app/comments/comments.module';
import { AllExceptionsFilter } from '@app/common/all-exceptions.filter';

/**
 * Root module. Composes the feature slice (`CommentsModule`, which pulls in the
 * repository, platforms, auth, and HTTP seams transitively) and registers the
 * `AllExceptionsFilter` globally so every route renders the shared error envelope.
 * `ConfigModule` loads environment configuration once, app-wide.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CommentsModule],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
