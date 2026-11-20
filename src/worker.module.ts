import { Module } from '@nestjs/common';
import { appConfigModule } from '@/config/config.module';
import { DatabaseModule } from '@/database/database.module';
import { RiskWorkerModule } from '@/risk/risk-worker.module';

/** Root module of the worker process: no HTTP server, just the queue consumer. */
@Module({
  imports: [appConfigModule, DatabaseModule, RiskWorkerModule],
})
export class WorkerModule {}
