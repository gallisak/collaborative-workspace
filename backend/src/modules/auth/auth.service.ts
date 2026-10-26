import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import argon2 from 'argon2';
import type { IssuedTokens } from '../../common/auth/auth.types.js';
import { isUniqueViolation } from '../../common/prisma-errors.js';
import type { User } from '../../generated/prisma/client.js';
import { UsersService } from '../users/users.service.js';
import type { LoginDto, RegisterDto } from './auth.dto.js';
import { TokenService } from './token.service.js';

export interface AuthResult {
  user: User;
  tokens: IssuedTokens;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash: string;

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash('timing-equalizer');
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const passwordHash = await argon2.hash(dto.password);
    let user: User;
    try {
      user = await this.users.create({ email: dto.email, name: dto.name, passwordHash });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }

    this.logger.log({ userId: user.id }, 'User registered');
    return { user, tokens: await this.tokens.issue(user) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    const valid = await argon2.verify(user?.passwordHash ?? this.dummyHash, dto.password);

    if (!user || !valid) {
      this.logger.warn({ email: dto.email }, 'Failed login attempt');
      throw new UnauthorizedException('Invalid email or password');
    }

    this.logger.log({ userId: user.id }, 'User logged in');
    return { user, tokens: await this.tokens.issue(user) };
  }

  refresh(refreshToken: string | undefined): Promise<AuthResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    return this.tokens.rotate(refreshToken);
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) {
      await this.tokens.revoke(refreshToken);
    }
  }

  async currentUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return user;
  }
}
