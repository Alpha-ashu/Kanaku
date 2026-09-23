/**
 * GROUP EXPENSE REALTIME FAN-OUT
 *
 * Locks in the §7 fix: a group-expense mutation must push a
 * `group_expense_updated` refresh to every user the read endpoints authorize,
 * because that socket event is the only thing that makes another member's
 * device re-pull. Three regressions are covered:
 *
 *   1. CREATE emitted nothing at all. `createGroup` declared a notification
 *      queue, drained it, but never pushed to it — so the drain always ran over
 *      an empty array and members learned about a new group expense only on the
 *      next cold start.
 *   2. Members matched by EMAIL were skipped. Every fan-out site was written as
 *      `if (m.userId)`, but getGroups/getGroup also grant access by email, so a
 *      participant added before they registered could open the group yet never
 *      receive a live update.
 *   3. The actor must not be told about their own change (it would cost every
 *      writer a redundant full re-sync).
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mockEmitted: { userId: string; event: string; payload: any }[] = [];

jest.mock('../../../../backend/src/sockets', () => {
  const actual = jest.requireActual('../../../../backend/src/sockets');
  return {
    ...actual,
    getSocketManager: () => ({
      notifyUser: (userId: string, event: string, payload: any) => {
        mockEmitted.push({ userId, event, payload });
      },
    }),
  };
});

import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';

const API = '/api/v1';

// Fixed ids keep the rows identifiable and re-runnable against the shared
// staging database.
const CREATOR_ID = '6b1f0c2e-9a44-4f0d-bb11-0d2f7a3c1101';
const REGISTERED_ID = '6b1f0c2e-9a44-4f0d-bb11-0d2f7a3c1102';
const LATE_SIGNUP_ID = '6b1f0c2e-9a44-4f0d-bb11-0d2f7a3c1103';

const CREATOR_EMAIL = 'fanout-creator@example.com';
const REGISTERED_EMAIL = 'fanout-registered@example.com';
const LATE_SIGNUP_EMAIL = 'fanout-late@example.com';

const tokenFor = (userId: string, email: string, name: string) => {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
  return jwt.sign(
    { userId, id: userId, email, name, role: 'user', isApproved: true },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
};

const seedUser = (id: string, email: string, name: string) =>
  prisma.user.upsert({
    where: { id },
    update: { email, status: 'verified', isApproved: true },
    create: { id, email, name, password: 'dummy', status: 'verified', role: 'user', isApproved: true },
  });

const eventsFor = (userId: string) =>
  mockEmitted.filter((e) => e.userId === userId && e.event === 'group_expense_updated');

/**
 * Two code paths emit `group_expense_updated`: this fan-out, with `{ groupId }`,
 * and the invitation service, generically for any module, with `{ id }`. Both
 * reach the same payload-agnostic client handler (AppContext just re-syncs), but
 * the invitation one fires first during creation — so picking events[0] asserted
 * against the wrong emitter.
 */
const fanoutEventsFor = (userId: string) =>
  eventsFor(userId).filter((e) => typeof e.payload?.groupId === 'string');

describe('Group expense realtime fan-out', () => {
  let creatorToken: string;
  let groupId: string;

  beforeAll(async () => {
    creatorToken = tokenFor(CREATOR_ID, CREATOR_EMAIL, 'Fanout Creator');

    await seedUser(CREATOR_ID, CREATOR_EMAIL, 'Fanout Creator');
    await seedUser(REGISTERED_ID, REGISTERED_EMAIL, 'Already Registered');

    // The late signup must NOT exist yet: that is what leaves the member row
    // with a null userId and reproduces regression #2.
    await prisma.groupExpenseMember.deleteMany({ where: { email: LATE_SIGNUP_EMAIL } });
    await prisma.user.deleteMany({ where: { id: LATE_SIGNUP_ID } });
  });

  afterAll(async () => {
    if (groupId) {
      await prisma.groupExpenseMember.deleteMany({ where: { groupExpenseId: groupId } });
      await prisma.groupExpense.deleteMany({ where: { id: groupId } });
    }
    await prisma.friend.deleteMany({ where: { userId: CREATOR_ID } });
  });

  it('notifies an already-registered member when the expense is CREATED', async () => {
    mockEmitted.length = 0;

    const res = await request(app)
      .post(`${API}/groups`)
      .set({ Authorization: `Bearer ${creatorToken}` })
      .send({
        name: 'Fan-out dinner',
        totalAmount: 900,
        date: new Date().toISOString(),
        splitType: 'equal',
        yourShare: 300,
        members: [
          { name: 'Already Registered', email: REGISTERED_EMAIL, share: 300 },
          { name: 'Late Signup', email: LATE_SIGNUP_EMAIL, share: 300 },
        ],
      });

    expect([200, 201]).toContain(res.status);
    groupId = res.body?.data?.id;
    expect(groupId).toBeTruthy();

    // Regression #1: this was zero before the fix.
    expect(eventsFor(REGISTERED_ID).length).toBeGreaterThan(0);
    expect(fanoutEventsFor(REGISTERED_ID)[0]?.payload).toEqual({ groupId });

    // Regression #3: the writer does not re-sync itself.
    expect(eventsFor(CREATOR_ID)).toHaveLength(0);
  });

  it('notifies a member matched only by EMAIL once they register', async () => {
    // The member row was written with userId=null above. The user now signs up
    // with that same address — exactly the case getGroups grants access to.
    await seedUser(LATE_SIGNUP_ID, LATE_SIGNUP_EMAIL, 'Late Signup');

    const memberRow = await prisma.groupExpenseMember.findFirst({
      where: { groupExpenseId: groupId, email: LATE_SIGNUP_EMAIL },
      select: { userId: true },
    });
    expect(memberRow).toBeTruthy();
    expect(memberRow?.userId).toBeNull(); // the precondition this test exists for

    // They can already READ the group by email…
    const readRes = await request(app)
      .get(`${API}/groups/${groupId}`)
      .set({ Authorization: `Bearer ${tokenFor(LATE_SIGNUP_ID, LATE_SIGNUP_EMAIL, 'Late Signup')}` });
    expect(readRes.status).toBe(200);

    // …so a change must reach them too. Regression #2: zero before the fix.
    mockEmitted.length = 0;
    const updateRes = await request(app)
      .put(`${API}/groups/${groupId}`)
      .set({ Authorization: `Bearer ${creatorToken}` })
      .send({ description: 'split corrected' });

    expect(updateRes.status).toBe(200);
    expect(eventsFor(LATE_SIGNUP_ID).length).toBeGreaterThan(0);
    expect(eventsFor(REGISTERED_ID).length).toBeGreaterThan(0);
    expect(eventsFor(CREATOR_ID)).toHaveLength(0);
  });

  it('notifies every member when the expense is DELETED', async () => {
    mockEmitted.length = 0;

    const res = await request(app)
      .delete(`${API}/groups/${groupId}`)
      .set({ Authorization: `Bearer ${creatorToken}` });

    expect(res.status).toBe(200);

    // The member rows are soft-deleted in the same instant as the expense, so
    // the fan-out has to look them up at that stamp rather than at deletedAt:null.
    expect(eventsFor(REGISTERED_ID).length).toBeGreaterThan(0);
    expect(eventsFor(LATE_SIGNUP_ID).length).toBeGreaterThan(0);
  });
});
