import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

/** Fallbacks for a category created without presentation (bulk import path). */
const DEFAULT_COLOR = '#6B7280';
const DEFAULT_ICON = 'tag';

/**
 * Transactions reference a category by NAME (`Transaction.category` is a String,
 * not a foreign key), so this table is presentation + user taxonomy only.
 * Deleting a category therefore never orphans or reclassifies a transaction —
 * the transaction keeps its label and simply stops matching a listed category.
 */
export const getCategories = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { type, createdFromImport } = req.query as {
      type?: string;
      createdFromImport?: unknown;
    };

    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (type) where.type = type;
    if (typeof createdFromImport === 'boolean') where.createdFromImport = createdFromImport;

    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    res.json({ success: true, data: categories });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('Categories fallback: database unavailable');
      return res.json({ success: true, data: [] });
    }
    next(error);
  }
};

/**
 * Create a category, converging rather than erroring on a repeat.
 *
 * A duplicate name is NOT a 400 here. Category creation is driven by clients
 * that cannot know the server's state — the importer meeting an unseen label,
 * or a device that was offline when the same category was added elsewhere. A
 * hard rejection makes those clients retry the identical request forever
 * (exactly the loop `DUPLICATE_BUDGET` produced in the budget sync). Returning
 * the existing row lets the caller link to it and move on, which is what it
 * wanted in the first place. A revived soft-deleted row behaves the same way.
 */
export const createCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { name, type, color, icon, createdFromImport } = req.body;

    const existing = await prisma.category.findFirst({ where: { userId, name, type } });

    if (existing && !existing.deletedAt) {
      return res.status(200).json({ success: true, data: existing, alreadyExisted: true });
    }

    if (existing?.deletedAt) {
      const revived = await prisma.category.update({
        where: { id: existing.id },
        data: { deletedAt: null, color, icon, createdFromImport: createdFromImport ?? false },
      });
      return res.status(200).json({ success: true, data: revived, revived: true });
    }

    const category = await prisma.category.create({
      data: { userId, name, type, color, icon, createdFromImport: createdFromImport ?? false },
    });

    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk upsert for the importer. Returns every requested category — created or
 * pre-existing — so one round trip gives the caller the complete name→id map it
 * needs to attach transactions, instead of N requests that can half-fail.
 */
export const bulkCreateCategories = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { categories, createdFromImport } = req.body as {
      categories: Array<{ name: string; type: string; color?: string; icon?: string }>;
      createdFromImport?: boolean;
    };

    // Collapse duplicates inside the request itself — a source file routinely
    // repeats the same category on every row.
    const requested = new Map<string, { name: string; type: string; color?: string; icon?: string }>();
    for (const entry of categories) {
      requested.set(`${entry.type}::${entry.name.toLowerCase()}`, entry);
    }

    const existing = await prisma.category.findMany({
      where: { userId, OR: [...requested.values()].map(({ name, type }) => ({ name, type })) },
    });
    const existingByKey = new Map(existing.map((row) => [`${row.type}::${row.name.toLowerCase()}`, row]));

    const created: typeof existing = [];
    const revived: typeof existing = [];

    for (const [key, entry] of requested) {
      const match = existingByKey.get(key);
      if (match && !match.deletedAt) continue;

      if (match?.deletedAt) {
        revived.push(
          await prisma.category.update({ where: { id: match.id }, data: { deletedAt: null } }),
        );
        continue;
      }

      created.push(
        await prisma.category.create({
          data: {
            userId,
            name: entry.name,
            type: entry.type,
            color: entry.color ?? DEFAULT_COLOR,
            icon: entry.icon ?? DEFAULT_ICON,
            createdFromImport: createdFromImport ?? true,
          },
        }),
      );
    }

    const all = await prisma.category.findMany({
      where: { userId, deletedAt: null, OR: [...requested.values()].map(({ name, type }) => ({ name, type })) },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    res.status(201).json({
      success: true,
      data: all,
      summary: { requested: requested.size, created: created.length, revived: revived.length },
    });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { name, color, icon } = req.body;

    const category = await prisma.category.findFirst({ where: { id, userId, deletedAt: null } });
    if (!category) throw AppError.notFound('Category');

    // A rename can collide with another of the same type. Unlike create, this is
    // a genuine conflict: the caller asked to rename THIS row onto a taken name,
    // and silently merging two categories would be destructive.
    if (name && name !== category.name) {
      const clash = await prisma.category.findFirst({
        where: { userId, name, type: category.type, deletedAt: null, NOT: { id } },
      });
      if (clash) {
        throw AppError.conflict(
          `A ${category.type} category named "${name}" already exists`,
          'DUPLICATE_CATEGORY',
        );
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
        ...(icon !== undefined && { icon }),
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/** Soft delete. Transactions keep their label (see the note on getCategories). */
export const deleteCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const category = await prisma.category.findFirst({ where: { id, userId, deletedAt: null } });
    if (!category) throw AppError.notFound('Category');

    await prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });

    // Tell the caller what still carries this label so the UI can offer to
    // reassign them rather than leaving the user with silently unlabelled rows.
    const affectedTransactions = await prisma.transaction.count({
      where: { userId, category: category.name, deletedAt: null },
    });

    res.json({ success: true, data: { id, affectedTransactions } });
  } catch (error) {
    next(error);
  }
};
