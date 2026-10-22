import { Injectable } from '@nestjs/common';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

@Injectable()
export class UsersRepository extends PrismaRepository {
  findById(id: string, tx?: Transaction) {
    return this.db(tx).user.findUnique({ where: { id } });
  }

  findByEmail(email: string, tx?: Transaction) {
    return this.db(tx).user.findUnique({ where: { email } });
  }

  create(data: { email: string; name: string; passwordHash: string }, tx?: Transaction) {
    return this.db(tx).user.create({ data });
  }
}
