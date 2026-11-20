import { ConsoleLogger } from '@nestjs/common';

/**
 * Readable, coloured logs in development; one JSON object per line in
 * production, so a log system can index and search the fields.
 */
export const createLogger = (): ConsoleLogger =>
  new ConsoleLogger({ json: process.env.NODE_ENV === 'production' });
