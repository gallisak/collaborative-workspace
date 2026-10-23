import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Application } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { API_PREFIX } from './common/api-prefix.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './common/auth/auth-cookies.js';
import { CORRELATION_HEADER } from './common/correlation.js';
import type { Env } from './infra/config/env.schema.js';
import { httpMetrics } from './infra/metrics/http-metrics.js';
import { MetricsService } from './infra/metrics/metrics.service.js';

export function setupApp(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy > 0) {
    (app.getHttpAdapter().getInstance() as Application).set('trust proxy', trustProxy);
  }
  app.use(httpMetrics(app.get(MetricsService)));
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'health/ready', 'metrics'] });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }).split(','),
    credentials: true,
    exposedHeaders: [CORRELATION_HEADER],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Collab Docs API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth(ACCESS_COOKIE)
    .addCookieAuth(REFRESH_COOKIE)
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, swaggerConfig), {
    jsonDocumentUrl: 'api/docs-json',
  });

  return config;
}
