/**
 * The Vault lock with the APP PIN GATE LIVE — the configuration production runs
 * (PIN_GATE_ENABLED=true) and the one no other suite covers, because
 * isPinGateEnabled() is off under NODE_ENV=test.
 *
 * That blind spot shipped a broken vault: every /vault route, the lock endpoints
 * included, sat behind pinGate. On any device that had not unlocked the app PIN
 * within PIN_GATE_TIMEOUT_MINUTES, GET /vault/lock/status answered 403, so the
 * Vault screen never learned a PIN was set and never showed its keypad; POST
 * /vault/lock/verify answered 403, so the keypad could not have worked anyway;
 * and changing the lock settings failed with a bare "you do not have permission".
 *
 * The rules pinned here:
 *   - lock state and the keypad are reachable with just a valid session;
 *   - vault CONTENTS still need the app PIN, and then the Vault PIN;
 *   - a client that cannot carry the unlock token (an app build released before
 *     it existed) still gets in for its auto-lock window after /lock/verify.
 */
import bcrypt from 'bcryptjs';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';

const API = '/api/v1';
const USER = { id: 'e1000000-0000-4000-8000-000000000001', email: 'vault-pin-gate@test.com' };
const APP_PIN = '135790';
const VAULT_PIN = '2468';

// The app and the gate module read these at import time, so they are set before
// the dynamic import below and restored afterwards (jest shares process.env
// across files, and maxWorkers is 1).
const previousEnv = {
  PIN_GATE_ENABLED: process.env.PIN_GATE_ENABLED,
  PIN_GATE_FORCE_IN_TESTS: process.env.PIN_GATE_FORCE_IN_TESTS,
  PIN_GATE_TIMEOUT_MINUTES: process.env.PIN_GATE_TIMEOUT_MINUTES,
};

let app: Express;
let prisma: typeof import('../../../../backend/src/db/prisma').prisma;
let token: string;

const tokenFor = (userId: string, email: string) => {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
  return jwt.sign({ userId, email, role: 'user', isApproved: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

const cleanup = async () => {
  await prisma.vaultAuditLog.deleteMany({ where: { ownerId: USER.id } }).catch(() => {});
  await prisma.vaultFolder.deleteMany({ where: { userId: USER.id } }).catch(() => {});
  await prisma.vaultLockSetting.deleteMany({ where: { userId: USER.id } }).catch(() => {});
  await prisma.userPin.deleteMany({ where: { userId: USER.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: USER.id } }).catch(() => {});
};

describe('Vault lock with the app PIN gate live', () => {
  beforeAll(async () => {
    process.env.PIN_GATE_ENABLED = 'true';
    process.env.PIN_GATE_FORCE_IN_TESTS = 'true';
    process.env.PIN_GATE_TIMEOUT_MINUTES = '5';

    ({ app } = await import('../../../../backend/src/app'));
    ({ prisma } = await import('../../../../backend/src/db/prisma'));

    token = tokenFor(USER.id, USER.email);
    await cleanup();
    await prisma.user.create({
      data: {
        id: USER.id,
        email: USER.email,
        name: 'Vault Pin Gate',
        password: await bcrypt.hash('Password123!', 10),
        role: 'user',
        isApproved: true,
        status: 'verified',
      },
    });
    // An app PIN last verified an hour ago: a device that has not unlocked recently.
    await prisma.userPin.create({
      data: {
        userId: USER.id,
        pinHash: await bcrypt.hash(APP_PIN, 10),
        isActive: true,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        lastVerifiedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    await prisma.vaultLockSetting.create({
      data: {
        userId: USER.id,
        isLockEnabled: true,
        vaultPinHash: await bcrypt.hash(VAULT_PIN, 10),
        pinLength: VAULT_PIN.length,
        autoLockMinutes: 5,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('serves the lock state without a live app-PIN unlock (the keypad can load)', async () => {
    const res = await request(app).get(`${API}/vault/lock/status`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.isLockEnabled).toBe(true);
    expect(res.body.hasPin).toBe(true);
    expect(res.body.pinLength).toBe(VAULT_PIN.length);
  });

  it('still refuses vault CONTENTS without a live app-PIN unlock', async () => {
    const res = await request(app).get(`${API}/vault/documents`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PIN_VERIFICATION_REQUIRED');
  });

  it('accepts the Vault PIN without a live app-PIN unlock and issues a token', async () => {
    const wrong = await request(app)
      .post(`${API}/vault/lock/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vaultPin: '9999' });
    expect(wrong.status).toBe(200);
    expect(wrong.body.verified).toBe(false);

    const res = await request(app)
      .post(`${API}/vault/lock/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vaultPin: VAULT_PIN });
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(typeof res.body.unlockToken).toBe('string');
  });

  it('opens the vault once both the app PIN and the Vault PIN are proved', async () => {
    const pin = await request(app)
      .post(`${API}/pin/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: APP_PIN });
    expect(pin.status).toBe(200);
    const pinUnlock = pin.headers['x-pin-unlock'];
    expect(typeof pinUnlock).toBe('string');

    const verify = await request(app)
      .post(`${API}/vault/lock/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vaultPin: VAULT_PIN });
    const vaultUnlock = verify.body.unlockToken;

    const res = await request(app)
      .get(`${API}/vault/documents`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pin-Unlock', pinUnlock)
      .set('X-Vault-Unlock', vaultUnlock);
    expect(res.status).toBe(200);
    expect(res.headers['x-vault-unlock']).toBeDefined();
  });

  it('lets a client that cannot carry the unlock token in after verifying (durable window)', async () => {
    const pin = await request(app)
      .post(`${API}/pin/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: APP_PIN });
    const pinUnlock = pin.headers['x-pin-unlock'];

    await request(app).post(`${API}/vault/lock/verify`).set('Authorization', `Bearer ${token}`).send({ vaultPin: VAULT_PIN });

    // No X-Vault-Unlock at all — an app build from before the token existed.
    const res = await request(app)
      .get(`${API}/vault/documents`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pin-Unlock', pinUnlock);
    expect(res.status).toBe(200);

    // ...but only inside the window: an older unlock is refused again.
    await prisma.vaultLockSetting.update({
      where: { userId: USER.id },
      data: { lastUnlockedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    const stale = await request(app)
      .get(`${API}/vault/documents`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Pin-Unlock', pinUnlock);
    expect(stale.status).toBe(403);
    expect(stale.body.code).toBe('VAULT_LOCKED');
  });

  it('changes the lock settings for the session holding the unlock token', async () => {
    const verify = await request(app)
      .post(`${API}/vault/lock/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vaultPin: VAULT_PIN });
    const vaultUnlock = verify.body.unlockToken;

    // Changing the lock is deliberately stricter than reading the vault: the
    // "unlocked recently" fallback that lets older clients read is NOT enough
    // here, so a stolen token cannot switch the lock off during someone else's
    // unlock window.
    const withoutToken = await request(app)
      .post(`${API}/vault/lock/configure`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isLockEnabled: false });
    expect(withoutToken.status).toBe(403);
    expect(withoutToken.body.code).toBe('VAULT_LOCKED');

    const res = await request(app)
      .post(`${API}/vault/lock/configure`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Vault-Unlock', vaultUnlock)
      .send({ isLockEnabled: true, autoLockMinutes: 10 });
    expect(res.status).toBe(200);
    expect(res.body.autoLockMinutes).toBe(10);
  });
});
