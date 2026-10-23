import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenRevocationService } from './access-token-revocation.service.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [JwtModule.register({})],
  providers: [TokenService, RefreshTokensRepository, AccessTokenRevocationService],
  exports: [TokenService],
})
export class TokensModule {}
