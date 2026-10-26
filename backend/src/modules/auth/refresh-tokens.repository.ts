import { Injectable } from '@nestjs/common';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

@Injectable()
export class RefreshTokensRepository extends PrismaRepository {
  create(
    data: { userId: string; tokenHash: string; familyId: string; expiresAt: Date },
    tx?: Transaction,
  ) {
    return this.db(tx).refreshToken.create({ data });
  }

  findByHashWithUser(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  }

  findFamilyByHash(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true },
    });
  }

  async markRotated(id: string, at: Date, client: string, tx: Transaction) {
    const { count } = await tx.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: at, rotatedAt: at, rotatedFrom: client },
    });
    return count === 1;
  }

  rotation(id: string, tx: Transaction) {
    return tx.refreshToken.findUniqueOrThrow({
      where: { id },
      select: { rotatedAt: true, rotatedFrom: true },
    });
  }

  countActiveInFamily(familyId: string, tx: Transaction) {
    return tx.refreshToken.count({ where: { familyId, revokedAt: null } });
  }

  revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
