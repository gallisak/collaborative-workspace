import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const config = setupApp(app);
  await app.listen(config.get('API_PORT', { infer: true }));
}

void bootstrap();
