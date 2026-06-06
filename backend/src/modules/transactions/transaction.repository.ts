import { createHash } from 'crypto';
import { prisma } from '../../db/prisma';
import { Prisma } from '../../db/prisma-client';

export type TransactionWithTags = {
  tags?: string | null;
  [key: string]: unknown;
};

export class TransactionRepository {
  generateDedupHash(userId: string, amount: number, date: Date, description?: string): string {
    const dateStr = date.toISOString().slice(0, 10);
    const payload = `${userId}:${amount}:${dateStr}:${description ?? ''}`;
    return createHash('sha256').update(payload).digest('hex');
  }

  serializeTags(tags: unknown): string | null {
    if (tags == null) return null;
    if (Array.isArray(tags)) {
      const normalized = tags
        .map((tag) => String(tag).trim())
        .filter(Boolean);
      return normalized.length > 0 ? JSON.stringify(normalized) : null;
    }
    if (typeof tags === 'string') {
      const trimmed = tags.trim();
      return trimmed || null;
    }
    return null;
  }

  deserializeTags(tags: string | null | undefined): string[] {
    if (!tags) return [];
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) {
        return parsed
          .map((tag) => String(tag).trim())
          .filter(Boolean);
      }
    } catch {
      // Fall back to legacy comma parsing
    }
    return tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  normalizeTransaction<T extends TransactionWithTags>(transaction: T): Omit<T, 'tags'> & { tags: string[] } {
    return {
      ...transaction,
      tags: this.deserializeTags(transaction.tags),
    };
  }

  async findMany(userId: string, whereClause: any, limit?: number, skip?: number) {
    const txs = await prisma.transaction.findMany({
      where: { userId, deletedAt: null, ...whereClause },
      orderBy: { date: 'desc' },
      ...(limit !== undefined ? { take: limit } : {}),
      ...(skip !== undefined ? { skip } : {}),
    });
    return txs.map(t => this.normalizeTransaction(t));
  }

  async count(userId: string, whereClause: any): Promise<number> {
    return prisma.transaction.count({
      where: { userId, deletedAt: null, ...whereClause },
    });
  }

  async findFirst(whereClause: any) {
    return prisma.transaction.findFirst({
      where: whereClause,
    });
  }

  async createWithBalanceUpdate(data: any, deltas: Map<string, number>) {
    return prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({ data });
      
      for (const [accountId, delta] of deltas.entries()) {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: delta } },
        });
      }
      
      return this.normalizeTransaction(created);
    });
  }

  async updateWithBalanceUpdate(id: string, data: any, deltas: Map<string, number>) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id },
        data,
      });

      for (const [accountId, delta] of deltas.entries()) {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: delta } },
        });
      }

      return this.normalizeTransaction(updated);
    });
  }

  async deleteWithBalanceUpdate(id: string, deltas: Map<string, number>) {
    return prisma.$transaction(async (tx) => {
      const deleted = await tx.transaction.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      for (const [accountId, delta] of deltas.entries()) {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: delta } },
        });
      }

      return deleted;
    });
  }
}

export const transactionRepository = new TransactionRepository();
