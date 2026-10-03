import { Controller, Get } from '@nestjs/common';

/** Polled by the deploy to decide whether a release came up. */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
