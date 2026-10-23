import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envFilePaths, validateEnv } from './config/env.schema.js';
import { LoggingModule } from './logging/logging.module.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: envFilePaths(),
      validate: validateEnv,
    }),
    LoggingModule,
    MailModule,
    PrismaModule,
    RedisModule,
  ],
})
export class CoreModule {}
