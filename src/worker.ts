import { NestFactory } from '@nestjs/core';
import { createLogger } from '@/common/logging/create-logger';
import { WorkerModule } from '@/worker.module';

/**
 * Entry point of the risk worker process: npm run start:worker
 * Scales separately from the API: run as many workers as the queue needs.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: createLogger(),
  });
  // On SIGTERM: stop taking new jobs, let running ones finish, close connections.
  app.enableShutdownHooks();
}
void bootstrap();
