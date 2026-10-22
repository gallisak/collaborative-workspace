import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { OriginGuard } from '../../common/security/origin.guard.js';
import { UsersModule } from '../users/users.module.js';
import { AccessTokenRevocationService } from './access-token-revocation.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    RefreshTokensRepository,
    AccessTokenRevocationService,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
