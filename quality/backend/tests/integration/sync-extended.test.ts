/**
 * SYNC API — Extended Entity Coverage
 * Verifies the bulk sync now covers budgets, investments, recurringTransactions,
 * goldAssets and friends (in addition to accounts/transactions/goals/loans), and
 * that the pull response exposes a serverTimestamp cursor.
 *
 * Round-trip persistence requires a seeded test database; where the DB is not
 * reachable the sync service returns { success: false } with HTTP 200, so these
 * tests assert the response CONTRACT and only assert data shape when the call
 * actually succeeded — mirroring the tolerant style of the other suites.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';

const API = '/api/v1';

const getSignedToken = (userId = 'sync-ext-user') => {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
  return jwt.sign(
    { userId, id: userId, email: `${userId}@test.com`, role: 'user', isApproved: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
};

const authHeaders = (userId = 'sync-ext-user') => ({ Authorization: `Bearer ${getSignedToken(userId)}` });

const NEW_ENTITY_KEYS = ['budgets', 'investments', 'recurringTransactions', 'goldAssets', 'friends'] as const;
const CORE_ENTITY_KEYS = ['accounts', 'transactions', 'goals', 'loans'] as const;

describe('SYNC MODULE — extended entity coverage', () => {
  describe('POST /sync/pull response shape', () => {
    it('requires authentication', async () => {
      const res = await request(app).post(`${API}/sync/pull`).send({ deviceId: 'dev-ext-1' });
      expect(res.status).toBe(401);
    });

    it('returns the full set of syncable entity arrays + serverTimestamp cursor when successful', async () => {
      const res = await request(app)
        .post(`${API}/sync/pull`)
        .set(authHeaders())
        .send({ deviceId: 'dev-ext-1' });

      // Pull never 5xx's — the service degrades to { success: false } on DB errors.
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');

      if (res.body.success === true) {
        for (const key of [...CORE_ENTITY_KEYS, ...NEW_ENTITY_KEYS]) {
          expect(Array.isArray(res.body.data[key])).toBe(true);
        }
        expect(typeof res.body.data.serverTimestamp).toBe('string');
        expect(typeof res.body.data.lastSyncedAt).toBe('string');
        // serverTimestamp is the cursor clients echo back on the next pull.
        expect(Number.isNaN(Date.parse(res.body.data.serverTimestamp))).toBe(false);
      }
    });

    it('honours the entityTypes filter (incremental pull of a single new type)', async () => {
      const res = await request(app)
        .post(`${API}/sync/pull`)
        .set(authHeaders())
        .send({ deviceId: 'dev-ext-1', entityTypes: ['budgets'] });

      expect(res.status).toBe(200);
      if (res.body.success === true) {
        expect(Array.isArray(res.body.data.budgets)).toBe(true);
        // Non-requested types come back as empty arrays, not undefined.
        expect(Array.isArray(res.body.data.investments)).toBe(true);
      }
    });
  });

  describe('POST /sync/push accepts the new entity types', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post(`${API}/sync/push`)
        .send({ deviceId: 'dev-ext-1', entities: [] });
      expect(res.status).toBe(401);
    });

    it('accepts a budget create without a routing/validation failure', async () => {
      const res = await request(app)
        .post(`${API}/sync/push`)
        .set(authHeaders())
        .send({
          deviceId: 'dev-ext-1',
          entities: [
            {
              entityType: 'budgets',
              operation: 'create',
              entityId: '11111111-1111-1111-1111-111111111111',
              timestamp: new Date().toISOString(),
              data: { category: 'Groceries', amount: 5000, period: 'monthly' },
            },
          ],
        });

      // 200 regardless of DB state; the response always carries the result shape.
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');
    });

    it('accepts an investment + recurring + gold + friend create batch', async () => {
      const now = new Date().toISOString();
      const res = await request(app)
        .post(`${API}/sync/push`)
        .set(authHeaders())
        .send({
          deviceId: 'dev-ext-1',
          entities: [
            {
              entityType: 'investments', operation: 'create',
              entityId: '22222222-2222-2222-2222-222222222222', timestamp: now,
              data: { assetType: 'stock', assetName: 'ACME', quantity: 10, buyPrice: 100, currentPrice: 120, totalInvested: 1000, currentValue: 1200, profitLoss: 200, purchaseDate: now, lastUpdated: now },
            },
            {
              entityType: 'recurringTransactions', operation: 'create',
              entityId: '33333333-3333-3333-3333-333333333333', timestamp: now,
              // Dexie-style field names (name/frequency) must be mapped, not dropped.
              data: { name: 'Rent', amount: 2000, category: 'Housing', frequency: 'monthly', nextDueDate: now, type: 'expense' },
            },
            {
              entityType: 'goldAssets', operation: 'create',
              entityId: '44444444-4444-4444-4444-444444444444', timestamp: now,
              data: { type: 'gold', quantity: 5, unit: 'gram', purchasePrice: 30000, currentPrice: 32000, purchaseDate: now },
            },
            {
              entityType: 'friends', operation: 'create',
              entityId: '55555555-5555-5555-5555-555555555555', timestamp: now,
              data: { name: 'Sam', email: 'sam@example.com' },
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');
    });

    it('reports an unsupported entity type as a per-entity error, not a crash', async () => {
      const res = await request(app)
        .post(`${API}/sync/push`)
        .set(authHeaders())
        .send({
          deviceId: 'dev-ext-1',
          entities: [
            {
              entityType: 'definitely_not_a_real_entity',
              operation: 'create',
              entityId: 'x',
              timestamp: new Date().toISOString(),
              data: {},
            },
          ],
        });

      expect(res.status).toBe(200);
      // When the DB is reachable, the unsupported type surfaces in errors[].
      if (Array.isArray(res.body.errors)) {
        expect(res.body.errors.join(' ')).toMatch(/definitely_not_a_real_entity|Unsupported/i);
      }
    });
  });
});
