import { Module } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { ClsModule, ClsServiceManager } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { resolveCorrelationId } from '../../common/correlation.js';
import { redactUrl } from '../../common/redact-url.js';
import type { Env } from '../config/env.schema.js';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req) => resolveCorrelationId(req as IncomingMessage),
      },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            genReqId: (req, res) => resolveCorrelationId(req, res),
            customAttributeKeys: { reqId: 'correlationId' },
            mixin: () => {
              const cls = ClsServiceManager.getClsService();
              if (!cls.isActive()) {
                return {};
              }
              const userId = cls.get<string | undefined>('userId');
              return { correlationId: cls.getId(), ...(userId && { userId }) };
            },
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.params.token'],
            serializers: {
              req: (req: { url: string }) => ({ ...req, url: redactUrl(req.url) }),
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            },
            autoLogging: {
              ignore: (req) => req.url === '/health',
            },
            transport: config.get('LOG_PRETTY', { infer: true })
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
                }
              : undefined,
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
