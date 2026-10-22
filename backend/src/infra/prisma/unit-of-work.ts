import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

export type Transaction = Prisma.TransactionClient;
export type Db = PrismaService | Transaction;

@Injectable()
export class UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }
}

@Injectable()
export abstract class PrismaRepository {
  constructor(protected readonly prisma: PrismaService) {}

  protected db(tx?: Transaction): Db {
    return tx ?? this.prisma;
  }
}
