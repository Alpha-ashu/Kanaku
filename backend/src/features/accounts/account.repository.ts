import { prisma } from '../../db/prisma';
import { KeysetPage, createdAtKeysetOrder, withCreatedAtKeyset } from '../../utils/pagination';

export class AccountRepository {
  async findMany(userId: string, limit = 100) {
    return prisma.account.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** One keyset page (limit + 1 rows) of the same set findMany returns. */
  async findPage(userId: string, page: KeysetPage) {
    return prisma.account.findMany({
      where: withCreatedAtKeyset({ userId, isActive: true }, page),
      orderBy: createdAtKeysetOrder(),
      take: page.limit + 1,
    });
  }

  async findFirst(whereClause: any) {
    return prisma.account.findFirst({
      where: whereClause,
    });
  }

  async findUnique(id: string) {
    return prisma.account.findUnique({
      where: { id },
    });
  }

  async findWithTransactions(id: string, userId: string) {
    return prisma.account.findFirst({
      where: { id, userId },
      include: {
        transactions: {
          orderBy: { date: 'desc' },
          take: 50,
        },
      },
    });
  }

  async create(data: any) {
    return prisma.account.create({
      data,
    });
  }

  async update(id: string, data: any) {
    return prisma.account.update({
      where: { id },
      data,
    });
  }
}

export const accountRepository = new AccountRepository();
