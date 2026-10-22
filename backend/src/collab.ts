import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CollabModule } from './collab.module.js';
import type { Env } from './infra/config/env.schema.js';

async function bootstrap() {
  const app = await NestFactory.create(CollabModule);
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('COLLAB_PORT', { infer: true }));
}

void bootstrap();
