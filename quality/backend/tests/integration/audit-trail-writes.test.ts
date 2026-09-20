/**
 * The audit interceptor, against a real database.
 *
 * audit-requestid.test.ts proves the *configuration* is complete (every model is
 * classified). This proves the interceptor actually behaves: that a mutation
 * produces a row, that the row carries who did it and what it touched, that a
 * FULL-tier model records the previous value while a LIGHT-tier one does not,
 * that secrets never reach `details`, and that the trail cannot be edited.
 */
import { prisma } from '../../../../backend/src/db/prisma';
import { requestContext } from '../../../../backend/src/middleware/requestContext';

const RUN_ID = `audit-trail-${Date.now()}`;
const USER_ID = `${RUN_ID}-user`;

/** Runs `fn` as if it were inside a request from `role`. */
const asActor = <T>(role: string, fn: () => Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const req: any = {
      id: `${RUN_ID}-req`,
      userId: USER_ID,
      user: { id: USER_ID, email: 'a@test.local', role, isApproved: true },
      ip: '198.51.100.7',
      headers: { 'user-agent': 'jest-audit' },
    };
    requestContext(req, {} as any, () => { fn().then(resolve, reject); });
  });

/**
 * Audit rows are written fire-and-forget by design (the user's request must not
 * wait on the trail), so poll briefly rather than assuming it has landed.
 */
const waitForAuditRow = async (
  where: Record<string, unknown>,
  timeoutMs = 5_000,
): Promise<any> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await prisma.auditLog.findFirst({
      where: where as any,
      orderBy: { createdAt: 'desc' },
    });
    if (row) return row;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe('Audit interceptor — durable trail', () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: USER_ID,
        email: `${RUN_ID}@test.local`,
        name: 'Audit Trail User',
        password: 'hashed-not-a-real-secret',
        role: 'user',
      },
    });
  });

  afterAll(async () => {
    // AuditLog rows are intentionally NOT cleaned up: the immutability trigger
    // refuses to delete anything inside the retention window, which is the
    // behaviour the last test in this file asserts.
    await prisma.user.deleteMany({ where: { id: USER_ID } });
  });

  it('records a row for an ordinary create, with actor, role and resource', async () => {
    const account = await asActor('manager', () =>
      prisma.account.create({
        data: { userId: USER_ID, name: 'Audited Account', type: 'bank' },
      }),
    );

    const row = await waitForAuditRow({ resourceType: 'Account', resourceId: account.id });

    expect(row).not.toBeNull();
    expect(row.userId).toBe(USER_ID);
    expect(row.action).toBe('data.create');
    // The acting role is denormalised onto the row so per-role reporting does
    // not depend on what the actor's role happens to be today.
    expect(row.actorRole).toBe('manager');
    expect(row.resource).toBe(`Account:${account.id}`);
    expect(row.ip).toBe('198.51.100.7');
  });

  it('captures the previous value for a FULL-tier model', async () => {
    const account = await asActor('user', () =>
      prisma.account.create({
        data: { userId: USER_ID, name: 'Before Rename', type: 'bank' },
      }),
    );
    await asActor('user', () =>
      prisma.account.update({ where: { id: account.id }, data: { name: 'After Rename' } }),
    );

    const row = await waitForAuditRow({
      resourceType: 'Account',
      resourceId: account.id,
      action: 'data.update',
    });

    expect(row).not.toBeNull();
    expect(row.details.before.name).toBe('Before Rename');
    expect(row.details.after.name).toBe('After Rename');
  });

  it('records a LIGHT-tier model without paying for a before-read', async () => {
    const device = await asActor('user', () =>
      prisma.device.create({
        data: { userId: USER_ID, deviceId: `${RUN_ID}-device`, deviceName: 'Pixel' },
      }),
    );

    const row = await waitForAuditRow({ resourceType: 'Device', resourceId: device.id });

    expect(row).not.toBeNull();
    expect(row.action).toBe('data.create');
    // `before` is absent rather than null: the LIGHT tier never reads it, and
    // null would imply the record genuinely had no prior state.
    expect(row.details.before).toBeUndefined();
    expect(row.details.after.deviceName).toBe('Pixel');
  });

  it('never writes a device push token into the trail', async () => {
    const device = await asActor('user', () =>
      prisma.device.create({
        data: {
          userId: USER_ID,
          deviceId: `${RUN_ID}-device-token`,
          fcmToken: 'fcm-super-secret-token-value',
        },
      }),
    );

    const row = await waitForAuditRow({ resourceType: 'Device', resourceId: device.id });

    expect(row).not.toBeNull();
    expect(JSON.stringify(row.details)).not.toContain('fcm-super-secret-token-value');
  });

  it('refuses to let the trail be edited or erased', async () => {
    const account = await asActor('user', () =>
      prisma.account.create({
        data: { userId: USER_ID, name: 'Tamper Target', type: 'cash' },
      }),
    );
    const row = await waitForAuditRow({ resourceType: 'Account', resourceId: account.id });
    expect(row).not.toBeNull();

    await expect(
      prisma.auditLog.update({ where: { id: row.id }, data: { status: 'tampered' } }),
    ).rejects.toThrow(/append-only/i);

    await expect(
      prisma.auditLog.delete({ where: { id: row.id } }),
    ).rejects.toThrow(/append-only/i);

    const survivor = await prisma.auditLog.findUnique({ where: { id: row.id } });
    expect(survivor?.status).toBe('success');
  });
});
