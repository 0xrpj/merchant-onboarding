import { Controller, Get } from '@nestjs/common';

export type HealthStatus = { status: 'ok' };

/**
 * Liveness check. Docker Compose and load balancers call this to see if the app is up.
 * Database and Redis checks are added once those connections exist.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok' };
  }
}
