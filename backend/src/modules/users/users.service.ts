import { Injectable } from '@nestjs/common';
import type { User } from '../../generated/prisma/client.js';
import type { PublicUser } from './user.dto.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  findById(id: string) {
    return this.users.findById(id);
  }

  findByEmail(email: string) {
    return this.users.findByEmail(email);
  }

  create(data: { email: string; name: string; passwordHash: string }) {
    return this.users.create(data);
  }

  static toPublic(user: User): PublicUser {
    return { id: user.id, email: user.email, name: user.name };
  }
}
