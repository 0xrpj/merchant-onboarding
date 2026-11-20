import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '@/app.module';
import { configureApp, setupSwagger } from '@/app.setup';
import { createLogger } from '@/common/logging/create-logger';
import type { Env } from '@/config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: createLogger() });

  // <Env, true>: get() knows every key and its type, and never returns undefined.
  const config = app.get(ConfigService<Env, true>);

  configureApp(app);

  // API docs are for development and review. Production does not advertise its endpoints.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupSwagger(app);
  }

  // On Ctrl+C or `docker stop`, Nest closes database and Redis connections cleanly.
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
