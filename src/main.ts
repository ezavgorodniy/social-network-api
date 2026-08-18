/* istanbul ignore file -- process entry point: exercised by running the app, not unit tests (ADR 0008) */
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const DEFAULT_PORT = 3000;
const GLOBAL_PREFIX = 'api/v1';

/**
 * Application entry point: builds the Nest app, mounts every route under
 * `/api/v1`, and listens on the configured `PORT`. The global exception filter is
 * bound in `AppModule`, so error handling is already in place here.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix(GLOBAL_PREFIX);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', DEFAULT_PORT);
  await app.listen(port);
}

void bootstrap();
