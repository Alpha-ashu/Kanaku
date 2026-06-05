import { prisma } from '../../db/prisma';

export class AccountRepository {
  async findMany(userId: string) {
    return prisma.account.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
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
