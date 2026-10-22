import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  live() {
    return { status: 'ok' };
  }
}
