import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { sanitize } from '../../utils/sanitize';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { cacheDeleteByPrefix } from '../../cache/redis';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

export const getLoans = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);

    const loans = await prisma.loan.findMany({
      where: { userId, deletedAt: null },
      include: { payments: { orderBy: { date: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: loans });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('Loans fallback: database unavailable, returning empty dataset.');
      return res.json({ success: true, data: [] });
    }

    next(error);
  }
};

export const createLoan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const {
      type,
      name,
      principalAmount,
      interestRate,
      emiAmount,
      dueDate,
      frequency,
      contactPerson,
      clientRequestId,
    } = req.body;

    if (!type || !name || !principalAmount) {
      throw AppError.badRequest('Missing required fields: type, name, and principalAmount are mandatory.', 'MISSING_FIELDS');
    }

    const numericPrincipal = Number(principalAmount);
    if (!isFinite(numericPrincipal) || numericPrincipal <= 0) {
      throw AppError.badRequest('Principal amount must be a positive number', 'INVALID_AMOUNT');
    }

    // Idempotency check
    if (clientRequestId && typeof clientRequestId === 'string') {
      const existing = await prisma.loan.findFirst({
        where: { clientRequestId, userId },
        include: { payments: true }
      });
      if (existing) {
        logger.info(`Idempotent loan creation request: ${clientRequestId}`);
        return res.status(200).json({ success: true, data: existing });
      }
    }

    const loan = await prisma.loan.create({
      data: {
        userId,
        type,
        name: sanitize(name),
        principalAmount: numericPrincipal,
        outstandingBalance: numericPrincipal,
        interestRate,
        emiAmount,
        dueDate: dueDate ? new Date(dueDate) : null,
        frequency,
        contactPerson: contactPerson ? sanitize(contactPerson) : undefined,
        status: 'active',
        clientRequestId: clientRequestId || null,
      },
      include: { payments: true },
    });

    await cacheDeleteByPrefix('loans:');

    res.status(201).json({ success: true, data: loan });
  } catch (error) {
    next(error);
  }
};

export const getLoan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id, userId },
      include: { payments: { orderBy: { date: 'desc' } } },
    });

    if (!loan) {
      throw AppError.notFound('Loan');
    }

    res.json({ success: true, data: loan });
  } catch (error) {
    next(error);
  }
};

export const updateLoan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const body = req.body;

    // Verify ownership
    const loan = await prisma.loan.findFirst({
      where: { id, userId },
    });

    if (!loan) {
      throw AppError.notFound('Loan');
    }

    // Validate numeric fields if provided
    if (body.principalAmount !== undefined) {
      const numAmount = Number(body.principalAmount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        throw AppError.badRequest('Principal amount must be a positive number', 'INVALID_AMOUNT');
      }
    }

    if (body.outstandingBalance !== undefined) {
      const numBalance = Number(body.outstandingBalance);
      if (!Number.isFinite(numBalance) || numBalance < 0) {
        throw AppError.badRequest('Outstanding balance must be a non-negative number', 'INVALID_BALANCE');
      }
    }

    if (body.interestRate !== undefined) {
      const numRate = Number(body.interestRate);
      if (!Number.isFinite(numRate) || numRate < 0) {
        throw AppError.badRequest('Interest rate must be a non-negative number', 'INVALID_RATE');
      }
    }

    if (body.emiAmount !== undefined) {
      const numEmi = Number(body.emiAmount);
      if (!Number.isFinite(numEmi) || numEmi < 0) {
        throw AppError.badRequest('EMI amount must be a non-negative number', 'INVALID_EMI');
      }
    }

    // Whitelist only permitted fields to prevent mass assignment
    const allowedFields = ['name', 'type', 'principalAmount', 'outstandingBalance', 'interestRate', 'emiAmount', 'dueDate', 'frequency', 'contactPerson', 'status', 'syncStatus'] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        // Sanitize text fields
        if ((field === 'name' || field === 'contactPerson') && typeof body[field] === 'string') {
          updates[field] = sanitize(body[field]);
        } else {
          updates[field] = body[field];
        }
      }
    }
    if (updates.dueDate) updates.dueDate = new Date(updates.dueDate);

    const updated = await prisma.loan.update({
      where: { id },
      data: { ...updates, updatedAt: new Date() },
      include: { payments: true },
    });

    await cacheDeleteByPrefix('loans:');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteLoan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    // Verify ownership
    const loan = await prisma.loan.findFirst({
      where: { id, userId },
    });

    if (!loan) {
      throw AppError.notFound('Loan');
    }

    // Soft delete
    await prisma.loan.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await cacheDeleteByPrefix('loans:');

    res.json({ success: true, message: 'Loan deleted' });
  } catch (error) {
    next(error);
  }
};

export const addLoanPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { amount, accountId, notes } = req.body;

    if (!amount) {
      throw AppError.badRequest('Amount is required', 'AMOUNT_REQUIRED');
    }

    // Validate amount is a positive finite number
    const numericAmount = Number(amount);
    if (!isFinite(numericAmount) || numericAmount <= 0) {
      throw AppError.badRequest('Amount must be a positive number', 'INVALID_AMOUNT');
    }

    // Verify ownership
    const loan = await prisma.loan.findFirst({
      where: { id, userId },
    });

    if (!loan) {
      throw AppError.notFound('Loan');
    }

    // Atomically create payment record and update outstanding balance
    const newBalance = Math.max(0, Number(loan.outstandingBalance) - numericAmount);

    const [payment] = await prisma.$transaction([
      prisma.loanPayment.create({
        data: {
          loanId: id,
          amount: numericAmount,
          accountId,
          date: new Date(),
          notes,
        },
      }),
      prisma.loan.update({
        where: { id },
        data: {
          outstandingBalance: newBalance,
          status: newBalance === 0 ? 'completed' : 'active',
        },
      }),
    ]);

    await cacheDeleteByPrefix('loans:');

    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

// ── Loan Settlement ───────────────────────────────────────────────────────────
// Settlement is a deliberate negotiated closure of a loan, which may be at a
// discounted amount (partial settlement). Unlike a normal payment, it immediately
// marks the loan as 'settled' and zeroes the outstanding balance, regardless of
// any remaining principal. Gated by the `loanSettlement` sub-feature.
export const settleLoan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { settledAmount, accountId, notes } = req.body;

    if (!settledAmount) {
      throw AppError.badRequest('settledAmount is required', 'AMOUNT_REQUIRED');
    }

    const numericAmount = Number(settledAmount);
    if (!isFinite(numericAmount) || numericAmount < 0) {
      throw AppError.badRequest('settledAmount must be a non-negative number', 'INVALID_AMOUNT');
    }

    const loan = await prisma.loan.findFirst({ where: { id, userId } });
    if (!loan) {
      throw AppError.notFound('Loan');
    }

    if (loan.status === 'settled' || loan.status === 'completed') {
      throw AppError.badRequest('Loan is already settled or completed', 'LOAN_ALREADY_CLOSED');
    }

    const [payment, updatedLoan] = await prisma.$transaction([
      prisma.loanPayment.create({
        data: {
          loanId: id,
          amount: numericAmount,
          accountId: accountId || null,
          date: new Date(),
          notes: notes ? sanitize(notes) : 'Loan settlement',
        },
      }),
      prisma.loan.update({
        where: { id },
        data: {
          outstandingBalance: 0,
          status: 'settled',
        },
        include: { payments: true },
      }),
    ]);

    await cacheDeleteByPrefix('loans:');
    logger.info(`Loan ${id} settled by user ${userId} for amount ${numericAmount}`);

    res.json({ success: true, data: { loan: updatedLoan, settlement: payment } });
  } catch (error) {
    next(error);
  }
};

