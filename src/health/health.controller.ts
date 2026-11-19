import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

export type HealthStatus = { status: 'ok' };

/**
 * Liveness check. Docker Compose and load balancers call this to see if the app is up.
 * Database and Redis checks are added once those connections exist.
 */
@ApiTags('System')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'The app is running.' })
  check(): HealthStatus {
    return { status: 'ok' };
  }
}
