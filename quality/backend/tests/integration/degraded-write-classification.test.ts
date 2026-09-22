/**
 * DEGRADED WRITE CLASSIFICATION (§9)
 *
 * Secondary persistence across this codebase is wrapped in a catch that warns
 * and continues, so a storage blip cannot throw away work the user already
 * waited for. That intent is right. The problem was that a SCHEMA MISMATCH got
 * the same treatment as a blip — and a missing column fails every time, for
 * every user, leaving nothing but a warn line.
 *
 * That is not hypothetical: a missing CollaborationParticipant.phone column
 * broke every group-expense invitation in an environment, hidden entirely
 * inside createGroup's `catch { logger.warn }`.
 *
 * These tests pin the boundary between the two, because the whole fix is that
 * boundary being drawn correctly. Over-classifying would page someone for a
 * dropped connection; under-classifying restores the silence.
 */
import { isStructuralDatabaseError } from '../../../../backend/src/utils/AppError';
import { reportDegradedWrite } from '../../../../backend/src/utils/degradedWrite';

/** Shape Prisma actually throws: a name, a code, a message. */
const prismaError = (code: string, message: string) =>
  Object.assign(new Error(message), { name: 'PrismaClientKnownRequestError', code });

describe('isStructuralDatabaseError', () => {
  it('flags a missing column — the case that motivated this', () => {
    const err = prismaError(
      'P2022',
      'Invalid `prisma.collaborationParticipant.findFirst()` invocation:\n\nThe column `CollaborationParticipant.phone` does not exist in the current database.',
    );
    expect(isStructuralDatabaseError(err)).toBe(true);
  });

  it('flags a missing table', () => {
    expect(isStructuralDatabaseError(prismaError('P2021', 'The table `public.Foo` does not exist'))).toBe(true);
  });

  it('flags a query that does not match the schema', () => {
    const err = Object.assign(new Error('Unknown argument `phone`'), { name: 'PrismaClientValidationError' });
    expect(isStructuralDatabaseError(err)).toBe(true);
  });

  it('recognises the missing-column wording even without a code', () => {
    // Errors reach these catch blocks wrapped, re-thrown and serialised; the
    // code does not always survive, but Prisma's wording does.
    const err = new Error('The column `X.y` does not exist in the current database.');
    expect(isStructuralDatabaseError(err)).toBe(true);
  });

  // The other half of the boundary: these must NOT be escalated, or the signal
  // is worthless and the original warn-and-continue behaviour is lost.
  it.each([
    ['connectivity (P1001)', prismaError('P1001', "Can't reach database server")],
    ['connection refused', new Error('connect ECONNREFUSED 10.0.0.1:5432')],
    ['timeout', new Error('Timed out fetching a new connection from the pool')],
    ['duplicate key (P2002)', prismaError('P2002', 'Unique constraint failed')],
    ['foreign key (P2003)', prismaError('P2003', 'Foreign key constraint failed')],
    ['record not found (P2025)', prismaError('P2025', 'Record to update not found')],
    ['plain storage failure', new Error('Supabase storage upload failed: fetch failed')],
  ])('does not flag %s as structural', (_label, err) => {
    expect(isStructuralDatabaseError(err)).toBe(false);
  });

  it('is safe on null/undefined', () => {
    expect(isStructuralDatabaseError(null)).toBe(false);
    expect(isStructuralDatabaseError(undefined)).toBe(false);
  });
});

describe('reportDegradedWrite', () => {
  it('classifies a schema mismatch as structural', () => {
    const kind = reportDegradedWrite({
      operation: 'test.structural',
      error: prismaError('P2022', 'The column `A.b` does not exist in the current database.'),
      context: { userId: 'u1' },
    });
    expect(kind).toBe('structural');
  });

  it('classifies a storage failure as transient', () => {
    const kind = reportDegradedWrite({
      operation: 'test.transient',
      error: new Error('Supabase storage upload failed: fetch failed'),
      context: { userId: 'u1' },
    });
    expect(kind).toBe('transient');
  });

  it('never throws out of the reporting path itself', () => {
    // It is called from inside catch blocks. If it can throw, it converts a
    // survivable degradation into the failure it exists to prevent.
    expect(() => reportDegradedWrite({ operation: 'test.null', error: null })).not.toThrow();
    expect(() => reportDegradedWrite({ operation: 'test.string', error: 'plain string' })).not.toThrow();
    expect(() =>
      reportDegradedWrite({ operation: 'test.circular', error: (() => {
        const e: any = new Error('circular');
        e.self = e;
        return e;
      })() }),
    ).not.toThrow();
  });
});
