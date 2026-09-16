/**
 * Notification triggers across features (2026-09-16).
 *
 * The user reported that notifications and emails were not triggered for PIN,
 * transactions, accounts, budgets, recurring, to-dos, groups, loans/EMIs, goals
 * and calendar dates. These tests pin the behaviour of notify() + the feature
 * triggers + the daily reminder sweep:
 *   - preferences default ON, merge safely, and mute a topic;
 *   - push is queued only for users with a registered device;
 *   - email only for important events (policy in notifications/triggers.ts);
 *   - every group-expense member hears about edits and payments, and members
 *     without an account get an email instead of a repeated invitation;
 *   - daily reminders fire once per item, date and offset.
 */
import { randomUUID } from 'crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../../backend/src/utils/email', () => ({
  sendEmail: jest.fn(async () => true),
  FROM_EMAIL: 'test@kanaku-test.invalid',
  FROM_NAME: 'Kanaku Test',
}));
jest.mock('../../../../backend/src/emails', () => ({
  ...jest.requireActual('../../../../backend/src/emails'),
  sendNotificationEmail: jest.fn(async () => true),
}));

import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { runDailyReminders } from '../../../../backend/src/workers/reminder.worker';
import { todoRepository } from '../../../../backend/src/features/todos/todo.repository';
import '../../../../backend/src/features/budgets/budget.listener';
import * as emails from '../../../../backend/src/emails';
import * as legacyEmail from '../../../../backend/src/utils/email';

const API = '/api/v1';
const DAY = 24 * 60 * 60 * 1000;
const createdUserIds: string[] = [];

interface TestUser { id: string; email: string; name: string; auth: Record<string, string> }

async function makeUser(label: string): Promise<TestUser> {
  const id = randomUUID();
  const email = `${label}.${id.slice(0, 8)}@kanaku-test.invalid`;
  await prisma.user.create({
    data: { id, email, name: label, password: 'x', emailVerified: true, isApproved: true, status: 'verified' },
  });
  createdUserIds.push(id);
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  process.env.JWT_SECRET = secret;
  const token = jwt.sign({ userId: id, id, email, role: 'user', isApproved: true }, secret, { expiresIn: '15m' });
  return { id, email, name: label, auth: { Authorization: `Bearer ${token}` } };
}

async function waitFor<T>(probe: () => Promise<T | null | undefined | false>, timeoutMs = 10_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 150));
  }
}

const channelsOf = (n: { channels: unknown }): string[] =>
  (typeof n.channels === 'string' ? JSON.parse(n.channels) : n.channels) as string[];

const notificationsOf = (userId: string, type?: string) =>
  prisma.notification.findMany({ where: { userId, ...(type ? { type } : {}) }, orderBy: { createdAt: 'asc' } });

async function makeAccount(user: TestUser) {
  const res = await request(app).post(`${API}/accounts`).set(user.auth)
    .send({ name: `Wallet ${randomUUID().slice(0, 4)}`, type: 'bank', openingBalance: 100000 });
  expect(res.status).toBeLessThan(300);
  return (res.body.data ?? res.body) as { id: string };
}

afterAll(async () => {
  await prisma.collaborationParticipant.deleteMany({ where: { invitedBy: { in: createdUserIds } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('notification preferences', () => {
  it('default on, merge partial updates, and survive a general settings save', async () => {
    const user = await makeUser('prefs');

    const initial = await request(app).get(`${API}/notifications/preferences`).set(user.auth);
    expect(initial.status).toBe(200);
    expect(Object.values(initial.body.data).every(Boolean)).toBe(true);

    const updated = await request(app).put(`${API}/notifications/preferences`).set(user.auth)
      .send({ emailNotifications: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data.emailNotifications).toBe(false);
    expect(updated.body.data.transactionAlerts).toBe(true);

    const settingsSave = await request(app).put(`${API}/settings`).set(user.auth)
      .send({ settings: { monthlyBudget: 20000 } });
    expect(settingsSave.status).toBe(200);

    const after = await request(app).get(`${API}/notifications/preferences`).set(user.auth);
    expect(after.body.data.emailNotifications).toBe(false);
  });

  it('rejects unknown preference keys', async () => {
    const user = await makeUser('prefs-bad');
    const res = await request(app).put(`${API}/notifications/preferences`).set(user.auth).send({ smsBlast: true });
    expect(res.status).toBe(400);
  });
});

describe('transactions and accounts', () => {
  it('announces a new account and folds rapid transactions into one notification', async () => {
    const user = await makeUser('txn');
    await prisma.device.create({
      data: { userId: user.id, deviceId: `dev-${user.id}`, platform: 'android', fcmToken: 'test-fcm-token', isActive: true },
    });

    const account = await makeAccount(user);
    const accountNote = await waitFor(async () => (await notificationsOf(user.id, 'account_created'))[0]);
    expect(accountNote.title).toBe('New account added');
    expect(channelsOf(accountNote)).toEqual(['app', 'push']);

    for (const [amount, description] of [[250, 'Tea'], [480, 'Lunch'], [1200, 'Groceries']] as const) {
      const res = await request(app).post(`${API}/transactions`).set(user.auth).send({
        accountId: account.id, type: 'expense', amount, category: 'Food & Dining', description,
        date: new Date().toISOString(),
      });
      expect(res.status).toBeLessThan(300);
      // Each create finishes its notification before the next one starts.
      await waitFor(async () => {
        const rows = await notificationsOf(user.id, 'transaction_created');
        return rows.length === 1 && Number((rows[0].metadata as any)?.count) >= 1 && rows;
      });
      await new Promise((r) => setTimeout(r, 400));
    }

    const rows = await notificationsOf(user.id, 'transaction_created');
    expect(rows).toHaveLength(1);
    expect((rows[0].metadata as any).count).toBe(3);
    expect(rows[0].title).toBe('3 new transactions');
    expect(channelsOf(rows[0])).not.toContain('email');
  });

  it('does not notify when the topic is muted', async () => {
    const user = await makeUser('muted');
    await request(app).put(`${API}/notifications/preferences`).set(user.auth).send({ transactionAlerts: false });
    await makeAccount(user);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await notificationsOf(user.id, 'account_created')).toHaveLength(0);
  });
});

describe('group expenses', () => {
  it('notifies and emails every member on edits and payments, without re-inviting', async () => {
    const owner = await makeUser('owner');
    const member = await makeUser('member');
    const outsiderEmail = `outsider.${randomUUID().slice(0, 8)}@kanaku-test.invalid`;

    const created = await request(app).post(`${API}/groups`).set(owner.auth).send({
      name: 'Goa trip', totalAmount: 1500, yourShare: 500, splitType: 'equal', date: new Date().toISOString(),
      members: [
        { name: 'member', email: member.email, share: 500 },
        { name: 'Outsider', email: outsiderEmail, share: 500 },
      ],
    });
    expect(created.status).toBe(201);
    const groupId = created.body.data.id as string;

    const invite = await waitFor(async () => (await notificationsOf(member.id, 'group_expense'))[0]);
    expect(channelsOf(invite)).toEqual(expect.arrayContaining(['app', 'email']));
    const invitationsTo = (address: string) =>
      (legacyEmail.sendEmail as jest.Mock).mock.calls.filter(([opts]) => opts.to === address).length;
    expect(invitationsTo(outsiderEmail)).toBe(1);

    const edited = await request(app).put(`${API}/groups/${groupId}`).set(owner.auth).send({
      totalAmount: 1800,
      members: [
        { name: 'member', email: member.email, share: 600 },
        { name: 'Outsider', email: outsiderEmail, share: 600 },
      ],
    });
    expect(edited.status).toBe(200);

    const updateNote = await waitFor(async () => (await notificationsOf(member.id, 'group_expense_updated'))[0]);
    expect(updateNote.message).toContain('Goa trip');
    expect(channelsOf(updateNote)).toContain('email');
    await waitFor(async () =>
      (emails.sendNotificationEmail as jest.Mock).mock.calls.some(([opts]) => opts.to === outsiderEmail));
    expect(invitationsTo(outsiderEmail)).toBe(1); // no second "you were added" mail

    const paid = await request(app).put(`${API}/groups/${groupId}`).set(member.auth).send({
      members: [{ name: 'member', email: member.email, share: 600, paid: true, isCurrentUser: true }],
    });
    expect(paid.status).toBe(200);
    const paymentNote = await waitFor(async () => (await notificationsOf(owner.id, 'group_expense_payment'))[0]);
    expect(paymentNote.message).toContain('paid their share');
    expect(channelsOf(paymentNote)).toContain('email');
  });
});

describe('daily reminders', () => {
  it('reminds once about due loans, goal deadlines, recurring payments and to-dos', async () => {
    const user = await makeUser('reminders');
    const now = new Date();

    await prisma.loan.create({
      data: {
        userId: user.id, type: 'borrowed', name: 'Bike EMI', principalAmount: 60000, outstandingBalance: 45000,
        emiAmount: 5000, dueDate: new Date(now.getTime() + DAY), status: 'active',
      },
    });
    await prisma.goal.create({
      data: { userId: user.id, name: 'Laptop', targetAmount: 80000, currentAmount: 20000, targetDate: new Date(now.getTime() + 7 * DAY) },
    });
    await prisma.recurringTransaction.create({
      data: { userId: user.id, title: 'Rent', amount: 18000, category: 'Housing', nextDueDate: new Date(now.getTime() + DAY) },
    });
    await todoRepository.findLists(user.id); // creates the to-do tables on a fresh database
    const [list] = await todoRepository.createList(user.id, 'Home');
    await prisma.$executeRaw`
      INSERT INTO public.todo_items (list_id, user_id, title, due_date)
      VALUES (${list.id}::bigint, ${user.id}::uuid, 'Pay electricity bill', ${new Date(now.getTime() + DAY)})
    `;

    await runDailyReminders(now);
    await runDailyReminders(now);

    const loan = await notificationsOf(user.id, 'loan_due');
    expect(loan).toHaveLength(1);
    expect(loan[0].title).toBe('EMI due reminder');
    expect(loan[0].message).toContain('is due tomorrow');
    expect(channelsOf(loan[0])).toContain('email');

    const goal = await notificationsOf(user.id, 'goal_deadline');
    expect(goal).toHaveLength(1);
    expect(goal[0].message).toContain('in 7 days');

    const recurring = await notificationsOf(user.id, 'recurring_due');
    expect(recurring).toHaveLength(1);
    expect(channelsOf(recurring[0])).not.toContain('email');

    const todo = await notificationsOf(user.id, 'todo_due');
    expect(todo).toHaveLength(1);
    expect(todo[0].title).toBe('Task due tomorrow');
  });
});

describe('budgets', () => {
  it('emails a critical alert when spending crosses the limit', async () => {
    const user = await makeUser('budget');
    const account = await makeAccount(user);
    const budget = await request(app).post(`${API}/budgets`).set(user.auth)
      .send({ category: 'Shopping', amount: 1000, period: 'monthly' });
    expect(budget.status).toBeLessThan(300);

    const tx = await request(app).post(`${API}/transactions`).set(user.auth).send({
      accountId: account.id, type: 'expense', amount: 1500, category: 'Shopping', description: 'Shoes',
      date: new Date().toISOString(),
    });
    expect(tx.status).toBeLessThan(300);

    const alert = await waitFor(async () =>
      (await notificationsOf(user.id, 'budget_alert')).find((n) => (n.metadata as any)?.level === 'critical'));
    expect(alert.title).toBe('Budget Limit Breached');
    expect(channelsOf(alert)).toContain('email');
  });
});
