import { ConfigModule } from '@nestjs/config';
import { envSchema } from '@/config/env.schema';

/**
 * Shared by the API (AppModule) and the worker (WorkerModule), so both
 * validate the environment the same way.
 */
export const appConfigModule = ConfigModule.forRoot({
  // Available in every module without importing ConfigModule again.
  isGlobal: true,
  // Reads values once and keeps them in memory.
  cache: true,
  // Checked at startup. Any problem stops the app with a list of what is wrong.
  validationSchema: envSchema,
});
