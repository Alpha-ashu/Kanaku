import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { heuristicParseStatement } from '../../../../backend/src/features/import/statement.parser';

const API = '/api/v1';
const TEST_USER_ID = 'stmt-import-test-user';

const getToken = () => {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
  return jwt.sign(
    { userId: TEST_USER_ID, id: TEST_USER_ID, email: 'stmt-import@example.com', role: 'user', isApproved: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
};

// HDFC-style CSV export: separate debit/credit columns + running balance
const STATEMENT_CSV = [
  'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
  '01/04/2026,UPI-SWIGGY BANGALORE,UPI123,450.00,,9550.00',
  '03/04/2026,NEFT SALARY ACME CORP,NEFT789,,50000.00,59550.00',
  '05/04/2026,ATM WDL MG ROAD,ATM456,2000.00,,57550.00',
].join('\n');

describe('BANK STATEMENT IMPORT', () => {
  const authToken = getToken();
  let accountId: string;

  beforeAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.user.create({
      data: {
        id: TEST_USER_ID, email: 'stmt-import@example.com', name: 'Stmt Import',
        password: 'x', role: 'user', isApproved: true, status: 'verified',
      },
    });
    const account = await prisma.account.create({
      data: { userId: TEST_USER_ID, name: 'Import Target', type: 'bank', balance: 10000, openingBalance: 10000 },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  });

  describe('heuristic parser (offline path)', () => {
    it('parses a debit/credit-column CSV with typed rows', () => {
      const parsed = heuristicParseStatement(STATEMENT_CSV);
      expect(parsed.transactions).toHaveLength(3);
      expect(parsed.transactions[0]).toMatchObject({ date: '2026-04-01', amount: 450, type: 'debit' });
      expect(parsed.transactions[1]).toMatchObject({ date: '2026-04-03', amount: 50000, type: 'credit' });
      expect(parsed.transactions[2]).toMatchObject({ date: '2026-04-05', amount: 2000, type: 'debit' });
      expect(parsed.transactions[1].balance).toBe(59550);
      expect(parsed.parser).toBe('heuristic');
    });

    it('uses running-balance deltas to correct debit/credit direction on text rows', () => {
      const text = [
        'STATE BANK STATEMENT',
        'Opening Balance   10000.00',
        '01-04-2026  MYSTERY NARRATION ONE   500.00   10500.00',
        '02-04-2026  MYSTERY NARRATION TWO   300.00   10200.00',
        'Closing Balance   10200.00',
      ].join('\n');
      const parsed = heuristicParseStatement(text);
      expect(parsed.transactions).toHaveLength(2);
      // Row 2 (delta −300) must be a debit even without keywords
      expect(parsed.transactions[1].type).toBe('debit');
      expect(parsed.openingBalance).toBe(10000);
      expect(parsed.closingBalance).toBe(10200);
    });

    it('flags a statement whose rows do not reconcile with balances', () => {
      const text = [
        'Opening Balance   1000.00',
        'Date,Description,Debit,Credit,Balance',
        '01/04/2026,COFFEE,100.00,,900.00',
        'Closing Balance   500.00',
      ].join('\n');
      const parsed = heuristicParseStatement(text);
      expect(parsed.reconciled).toBe(false);
      expect(parsed.warnings.some(w => w.includes('does not reconcile'))).toBe(true);
    });
  });

  describe('POST /import/statement → /import/confirm (end-to-end)', () => {
    let sessionId: string;

    it('uploads a CSV statement and returns typed preview rows', async () => {
      const res = await request(app)
        .post(`${API}/import/statement`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(STATEMENT_CSV, 'utf-8'), 'statement.csv');

      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(3);
      expect(res.body.transactions.map((t: any) => t.type)).toEqual(['debit', 'credit', 'debit']);
      expect(res.body.statement).toBeDefined();
      sessionId = res.body.sessionId;
    }, 30000);

    it('rejects confirm without a target account', async () => {
      const res = await request(app)
        .post(`${API}/import/confirm`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sessionId });
      expect(res.status).toBe(400); // zod: accountId required
    });

    it("rejects confirm into another user's account", async () => {
      const foreignUserId = 'some-other-user-stmt';
      await prisma.user.upsert({
        where: { id: foreignUserId },
        update: {},
        create: { id: foreignUserId, email: 'foreign-stmt@example.com', name: 'Foreign', password: 'x', role: 'user', isApproved: true },
      });
      const foreign = await prisma.account.create({
        data: { userId: foreignUserId, name: 'Foreign', type: 'bank', balance: 0, openingBalance: 0 },
      });
      try {
        const res = await request(app)
          .post(`${API}/import/confirm`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ sessionId, accountId: foreign.id });
        expect(res.status).toBe(404);
      } finally {
        await prisma.account.delete({ where: { id: foreign.id } });
        await prisma.user.delete({ where: { id: foreignUserId } });
      }
    });

    it('bulk-saves the selection atomically and applies one net balance change', async () => {
      const before = await prisma.account.findUnique({ where: { id: accountId } });

      const res = await request(app)
        .post(`${API}/import/confirm`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sessionId, accountId, selectedRows: [0, 1, 2] });

      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(3);
      expect(res.body.duplicates).toBe(0);
      // net = −450 + 50000 − 2000 = +47550
      expect(res.body.netBalanceChange).toBeCloseTo(47550, 2);

      const after = await prisma.account.findUnique({ where: { id: accountId } });
      expect(Number(after!.balance)).toBeCloseTo(Number(before!.balance) + 47550, 2);

      const rows = await prisma.transaction.findMany({ where: { userId: TEST_USER_ID }, orderBy: { date: 'asc' } });
      expect(rows).toHaveLength(3);
      expect(rows.map(r => r.type)).toEqual(['expense', 'income', 'expense']);
      expect(rows.every(r => r.accountId === accountId)).toBe(true);
      expect(rows.every(r => r.dedupHash)).toBe(true);
    }, 30000);

    it('re-importing the same statement skips every row as a duplicate (idempotent)', async () => {
      const upload = await request(app)
        .post(`${API}/import/statement`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(STATEMENT_CSV, 'utf-8'), 'statement.csv');
      expect(upload.status).toBe(200);

      const before = await prisma.account.findUnique({ where: { id: accountId } });
      const res = await request(app)
        .post(`${API}/import/confirm`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sessionId: upload.body.sessionId, accountId });

      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(0);
      expect(res.body.duplicates).toBe(3);

      const after = await prisma.account.findUnique({ where: { id: accountId } });
      expect(Number(after!.balance)).toBeCloseTo(Number(before!.balance), 2); // unchanged
      expect(await prisma.transaction.count({ where: { userId: TEST_USER_ID } })).toBe(3);
    }, 30000);

    it('rejects an import that would overdraw the account, leaving no partial rows', async () => {
      const csv = [
        'Date,Description,Debit,Credit',
        '10/04/2026,HUGE PURCHASE ONE,900000.00,',
        '11/04/2026,SMALL PURCHASE,10.00,',
      ].join('\n');
      const upload = await request(app)
        .post(`${API}/import/statement`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csv, 'utf-8'), 'big.csv');
      expect(upload.status).toBe(200);

      const before = await prisma.account.findUnique({ where: { id: accountId } });
      const countBefore = await prisma.transaction.count({ where: { userId: TEST_USER_ID } });

      const res = await request(app)
        .post(`${API}/import/confirm`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sessionId: upload.body.sessionId, accountId });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('IMPORT_OVERDRAW');

      // Transaction rolled back: no rows, no balance change
      const after = await prisma.account.findUnique({ where: { id: accountId } });
      expect(Number(after!.balance)).toBeCloseTo(Number(before!.balance), 2);
      expect(await prisma.transaction.count({ where: { userId: TEST_USER_ID } })).toBe(countBefore);
    }, 30000);
  });
});
