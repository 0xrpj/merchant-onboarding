import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { RedisHealthIndicator } from '@/health/redis.health';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

/**
 * Readiness check. Docker Compose and load balancers call this.
 * 200 when every dependency answers, 503 when one doesn't.
 */
@ApiTags('System')
// Docker and load balancers call this without logging in.
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Runs `SELECT 1`. Counts as down if Postgres doesn't answer within 1 second.
      () => this.db.pingCheck('database', { timeout: 1_000 }),
      // The risk queue lives in Redis. Without it, submissions can't start a risk check.
      () => this.redis.check('redis', 1_000),
    ]);
  }
}
