import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/database', () => ({ db: {} }));
vi.mock('@/utils/supabase/client', () => ({ default: { auth: {} } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));

import { toLocalNotification } from '@/lib/notifications';

describe('toLocalNotification', () => {
  it('reads the camelCase rows the API returns', () => {
    const local = toLocalNotification({
      id: 'n-1',
      type: 'group_expense_updated',
      title: 'Group expense updated: Goa trip',
      message: 'Asha updated "Goa trip".',
      userId: 'u-1',
      isRead: true,
      createdAt: '2026-09-16T10:00:00.000Z',
      deepLink: '/groups',
      category: 'group',
    });

    expect(local.remoteId).toBe('n-1');
    expect(local.userId).toBe('u-1');
    expect(local.isRead).toBe(true);
    expect(local.createdAt.toISOString()).toBe('2026-09-16T10:00:00.000Z');
    expect(local.deepLink).toBe('/groups');
    expect(local.category).toBe('group');
  });

  it('still accepts the legacy snake_case shape', () => {
    const local = toLocalNotification({
      id: 'n-2',
      type: 'loan_due',
      title: 't',
      message: 'm',
      user_id: 'u-2',
      is_read: false,
      created_at: '2026-09-15T08:30:00.000Z',
    });

    expect(local.userId).toBe('u-2');
    expect(local.isRead).toBe(false);
    expect(local.createdAt.toISOString()).toBe('2026-09-15T08:30:00.000Z');
  });

  it('never produces an invalid date or an undefined read state', () => {
    const local = toLocalNotification({ id: 7 as unknown as string, type: 'info', title: 't', message: 'm' });
    expect(Number.isNaN(local.createdAt.getTime())).toBe(false);
    expect(local.isRead).toBe(false);
    expect(local.remoteId).toBe('7');
  });
});
