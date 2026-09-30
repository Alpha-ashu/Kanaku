/**
 * Importing third-party data and exporting your own.
 *
 * Pins the behaviour users depend on for "import my old app / my bank, export
 * everything":
 *   - an upload preview belongs to its uploader (no reading or confirming someone
 *     else's statement by session id);
 *   - signed amounts, debit/credit columns and day-first dates are read right,
 *     and an unreadable date is reported instead of becoming today;
 *   - two identical rows in one file both import, and re-importing adds nothing;
 *   - app-parsed rows (multi-account, transfers) import in one request, move each
 *     balance once, come back with server ids, and are idempotent;
 *   - the JSON export carries the data but no secrets, and the CSV export cannot
 *     smuggle a spreadsheet formula.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';

const API = '/api/v1';

const secret = () => {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long-for-testing';
  return process.env.JWT_SECRET;
};
const bearer = (userId: string) =>
  `Bearer ${jwt.sign({ userId, id: userId, role: 'user', isApproved: true, type: 'access', jti: randomUUID() }, secret(), { expiresIn: '15m' })}`;

describe('Data portability: third-party import and export', () => {
  const owner = { id: randomUUID(), email: '' };
  const other = { id: randomUUID(), email: '' };
  let savings = '';
  let current = '';
  let dbReady = false;

  const balanceOf = async (id: string) => Number((await prisma.account.findUniqueOrThrow({ where: { id } })).balance);

  beforeAll(async () => {
    try {
      for (const u of [owner, other]) {
        u.email = `portability.${u.id.slice(0, 8)}@example.com`;
        await prisma.user.create({
          data: { id: u.id, email: u.email, name: 'Portability', password: 'secret-hash', role: 'user', isApproved: true, status: 'verified', syncToken: 'internal-sync-token' },
        });
      }
      savings = (await prisma.account.create({ data: { userId: owner.id, name: 'Savings', type: 'bank', balance: 10_000, openingBalance: 10_000 } })).id;
      current = (await prisma.account.create({ data: { userId: owner.id, name: 'Current', type: 'bank', balance: 500, openingBalance: 500 } })).id;
      dbReady = true;
    } catch {
      /* no database — cases self-skip */
    }
  });

  afterAll(async () => {
    const ids = [owner.id, other.id];
    await prisma.transaction.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
    await prisma.account.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
  });

  describe('spreadsheet upload → review → confirm', () => {
    const csv = [
      'Date,Description,Amount',
      '05/01/2025,"Salary, January",50000',
      '13/01/2025,Tea,-20',
      '13/01/2025,Tea,-20',
      'soon,Mystery,-5',
    ].join('\n');
    let sessionId = '';

    it('reads signs, day-first dates and quoted commas; reports the unreadable date', async () => {
      if (!dbReady) return;
      const res = await request(app).post(`${API}/import/upload`).set('Authorization', bearer(owner.id))
        .attach('file', Buffer.from(csv, 'utf-8'), 'bank.csv');
      expect(res.status).toBe(200);
      sessionId = res.body.sessionId;
      expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
      const rows = res.body.transactions;
      expect(rows.map((r: { type: string }) => r.type)).toEqual(['credit', 'debit', 'debit', 'debit']);
      expect(rows.map((r: { date: string }) => r.date)).toEqual(['2025-01-05', '2025-01-13', '2025-01-13', '']);
      expect(rows[0].description).toBe('Salary, January');
      expect(rows[3].dateError).toBe('soon');
    });

    it("keeps a preview private to the user who uploaded it", async () => {
      if (!dbReady) return;
      const peek = await request(app).get(`${API}/import/${sessionId}`).set('Authorization', bearer(other.id));
      expect(peek.status).toBe(404);
      const steal = await request(app).post(`${API}/import/confirm`).set('Authorization', bearer(other.id))
        .send({ sessionId, accountId: savings });
      expect(steal.status).toBe(404);
      const own = await request(app).get(`${API}/import/${sessionId}`).set('Authorization', bearer(owner.id));
      expect(own.status).toBe(200);
    });

    it('imports both identical rows once, lets the review fix a date, and returns the new rows', async () => {
      if (!dbReady) return;
      const before = await balanceOf(savings);
      const res = await request(app).post(`${API}/import/confirm`).set('Authorization', bearer(owner.id))
        .send({ sessionId, accountId: savings, overrides: { 3: { date: '2025-01-14' } } });
      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(4);
      expect(res.body.duplicates).toBe(0);
      expect(res.body.transactions).toHaveLength(4);
      expect(res.body.transactions[0].id).toBeTruthy();
      // +50000 − 20 − 20 − 5
      expect(res.body.accountBalance).toBeCloseTo(before + 49_955, 2);
      expect(await balanceOf(savings)).toBeCloseTo(before + 49_955, 2);
    });

    it('re-importing the same file adds nothing — including the repeated row', async () => {
      if (!dbReady) return;
      const upload = await request(app).post(`${API}/import/upload`).set('Authorization', bearer(owner.id))
        .attach('file', Buffer.from(csv, 'utf-8'), 'bank.csv');
      const before = await balanceOf(savings);
      const res = await request(app).post(`${API}/import/confirm`).set('Authorization', bearer(owner.id))
        .send({ sessionId: upload.body.sessionId, accountId: savings, overrides: { 3: { date: '2025-01-14' } } });
      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(0);
      expect(res.body.duplicates).toBe(4);
      expect(await balanceOf(savings)).toBeCloseTo(before, 2);
    });
  });

  describe('app-parsed rows (third-party exports, backups)', () => {
    const rows = () => [
      { clientRowId: 'r1', accountId: savings, type: 'income', amount: 1200, date: '2025-02-01', category: 'Salary', description: 'Bonus', externalId: 'app:1' },
      { clientRowId: 'r2', accountId: current, type: 'expense', amount: 300, date: '2025-02-02', category: 'Food', description: 'Dinner', externalId: 'app:2' },
      { clientRowId: 'r3', accountId: savings, type: 'transfer', amount: 1000, date: '2025-02-03', category: 'Transfer', transferToAccountId: current, description: 'Top up', externalId: 'app:3' },
      { clientRowId: 'r4', accountId: randomUUID(), type: 'expense', amount: 10, date: '2025-02-04', category: 'Food', description: 'Nowhere' },
    ];

    it('imports across accounts in one request, moving each balance once', async () => {
      if (!dbReady) return;
      const [s0, c0] = [await balanceOf(savings), await balanceOf(current)];
      const res = await request(app).post(`${API}/import/transactions`).set('Authorization', bearer(owner.id))
        .set('Idempotency-Key', randomUUID())
        .send({ source: 'moneymanager.csv', rows: rows() });
      expect(res.status).toBe(200);
      expect(res.body.created.map((c: { key: string }) => c.key).sort()).toEqual(['r1', 'r2', 'r3']);
      expect(res.body.failed).toEqual([expect.objectContaining({ key: 'r4', code: 'ACCOUNT_UNAVAILABLE' })]);
      expect(res.body.created.every((c: { transaction: { id: string } }) => c.transaction.id)).toBe(true);

      // savings: +1200 −1000; current: −300 +1000
      expect(await balanceOf(savings)).toBeCloseTo(s0 + 200, 2);
      expect(await balanceOf(current)).toBeCloseTo(c0 + 700, 2);
      const reported = Object.fromEntries(res.body.accounts.map((a: { id: string; balance: number }) => [a.id, a.balance]));
      expect(reported[savings]).toBeCloseTo(s0 + 200, 2);
    });

    it('is idempotent: the same rows again change nothing', async () => {
      if (!dbReady) return;
      const [s0, c0] = [await balanceOf(savings), await balanceOf(current)];
      const res = await request(app).post(`${API}/import/transactions`).set('Authorization', bearer(owner.id))
        .set('Idempotency-Key', randomUUID())
        .send({ source: 'moneymanager.csv', rows: rows() });
      expect(res.status).toBe(200);
      expect(res.body.created).toHaveLength(0);
      expect(res.body.duplicates).toHaveLength(3);
      expect(await balanceOf(savings)).toBeCloseTo(s0, 2);
      expect(await balanceOf(current)).toBeCloseTo(c0, 2);
    });

    it("cannot write into another user's account", async () => {
      if (!dbReady) return;
      const res = await request(app).post(`${API}/import/transactions`).set('Authorization', bearer(other.id))
        .set('Idempotency-Key', randomUUID())
        .send({ source: 'x.csv', rows: [{ clientRowId: 'x', accountId: savings, type: 'expense', amount: 5, date: '2025-03-01', category: 'Food' }] });
      expect(res.status).toBe(200);
      expect(res.body.created).toHaveLength(0);
      expect(res.body.failed[0].code).toBe('ACCOUNT_UNAVAILABLE');
    });

    it('rejects malformed rows before touching the ledger', async () => {
      if (!dbReady) return;
      const res = await request(app).post(`${API}/import/transactions`).set('Authorization', bearer(owner.id))
        .send({ source: 'bad.csv', rows: [{ clientRowId: 'b', accountId: savings, type: 'expense', amount: -5, date: '2025-03-01', category: 'Food' }] });
      expect(res.status).toBe(400);
    });
  });

  describe('accounts created with their transactions', () => {
    it('opens a new account at its opening balance, not a client balance that already includes transactions', async () => {
      if (!dbReady) return;
      const res = await request(app).post(`${API}/accounts`).set('Authorization', bearer(owner.id))
        .send({ name: 'Restored Wallet', type: 'bank', balance: 700, openingBalance: 200 });
      expect([200, 201]).toContain(res.status);
      const row = await prisma.account.findFirstOrThrow({ where: { userId: owner.id, name: 'Restored Wallet' } });
      expect(Number(row.openingBalance)).toBe(200);
      expect(Number(row.balance)).toBe(200);
      await prisma.account.delete({ where: { id: row.id } });
    });
  });

  describe('export', () => {
    it('exports everything the user owns, without secrets or internal keys', async () => {
      if (!dbReady) return;
      const res = await request(app).get(`${API}/settings/export`).set('Authorization', bearer(owner.id));
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="kanaku-export-/);
      expect(res.body).toMatchObject({ format: 'kanaku-export', schemaVersion: 2 });
      expect(res.body.user.email).toBe(owner.email);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('secret-hash');
      expect(text).not.toContain('internal-sync-token');
      expect(text).not.toContain('dedupHash');
      expect(res.body.accounts.map((a: { name: string }) => a.name).sort()).toEqual(['Current', 'Savings']);
      expect(res.body.transactions.length).toBeGreaterThanOrEqual(7);
      expect(res.body.transactions[0]).toHaveProperty('accountId');
    });

    it('writes a CSV that opens formulas as text and names the accounts', async () => {
      if (!dbReady) return;
      await prisma.transaction.create({
        data: { userId: owner.id, accountId: savings, type: 'expense', amount: 1, category: 'Food', description: '=HYPERLINK("http://evil.example","x")', date: new Date('2025-04-01') },
      });
      const res = await request(app).get(`${API}/transactions/export`).set('Authorization', bearer(owner.id)).buffer(true);
      expect(res.status).toBe(200);
      const text = res.text.replace(/^\uFEFF/, '');
      expect(text.split('\n')[0]).toBe('ID,Date,Type,Category,Subcategory,Amount,Description,Merchant,Account,To Account,Currency');
      expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
      expect(text).toContain('"Savings"');
    });
  });
});
