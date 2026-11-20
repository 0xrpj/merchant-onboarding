import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

/**
 * Readiness check. Docker Compose and load balancers call this.
 * 200 when every dependency answers, 503 when one doesn't.
 * Redis is added here once the queue exists.
 */
@ApiTags('System')
// Docker and load balancers call this without logging in.
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Runs `SELECT 1`. Counts as down if Postgres doesn't answer within 1 second.
      () => this.db.pingCheck('database', { timeout: 1_000 }),
    ]);
  }
}
