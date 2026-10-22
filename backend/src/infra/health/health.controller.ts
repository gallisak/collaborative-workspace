import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/auth/decorators.js';

@SkipThrottle()
@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  live() {
    return { status: 'ok' };
  }
}
