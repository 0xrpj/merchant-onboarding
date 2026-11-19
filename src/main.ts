import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '@/app.module';
import type { Env } from '@/config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // <Env, true>: get() knows every key and its type, and never returns undefined.
  const config = app.get(ConfigService<Env, true>);

  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();