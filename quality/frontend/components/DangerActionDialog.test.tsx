// @vitest-environment jsdom
/**
 * The delete-account / reset-data confirmation. It must never let an action run
 * without the confirm word and (when required) a proof, must show the server's
 * refusal instead of a form, and must recover cleanly from a wrong password or a
 * used code.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  deletionCheck: vi.fn(),
  stepUpMethods: vi.fn(),
  sendEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
}));
vi.mock('@/services/accountLifecycleService', () => ({ accountLifecycleService: svc }));
// lucide-react resolves the root React 18 copy; stub icons (see PricingPage.test.tsx).
vi.mock('lucide-react', () => {
  const Icon = () => null;
  return { AlertTriangle: Icon, CheckCircle2: Icon, Download: Icon, KeyRound: Icon, Loader2: Icon, Mail: Icon, RotateCcw: Icon, Trash2: Icon, X: Icon };
});

import { DangerActionDialog } from '@/app/components/shared/DangerActionDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const $ = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const type = async (id: string, value: string) => {
  const input = $(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const click = async (id: string) => {
  await act(async () => { $(id)!.click(); });
  await flush();
};

const serverError = (status: number, data: Record<string, unknown>) =>
  new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, { status, data, statusText: '', headers: {}, config: {} } as AxiosResponse);

const methods = (password: boolean) => ({ password, emailCode: true, email: 'us***@example.com' });

const render = async (props: Partial<React.ComponentProps<typeof DangerActionDialog>> = {}) => {
  const onConfirm = props.onConfirm ?? vi.fn().mockResolvedValue(undefined);
  await act(async () => {
    root.render(
      <DangerActionDialog action="delete-account" accountEmail="user@example.com" onClose={vi.fn()} onConfirm={onConfirm} {...props} />,
    );
  });
  await flush();
  return { onConfirm };
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('DangerActionDialog', () => {
  it('shows why an admin cannot delete, with no way to proceed', async () => {
    svc.deletionCheck.mockResolvedValue({
      allowed: false, requiresProof: true, openBookings: 0, methods: methods(true),
      blockers: [{ code: 'ADMIN_SELF_DELETE_FORBIDDEN', message: 'Admins cannot delete their own account.' }],
    });
    await render();
    expect($('danger-dialog-blocked')?.textContent).toContain('Admins cannot delete their own account.');
    expect($('danger-dialog-confirm')).toBeNull();
  });

  it('needs the confirm word and the password before it deletes', async () => {
    svc.deletionCheck.mockResolvedValue({ allowed: true, requiresProof: true, openBookings: 2, blockers: [], methods: methods(true) });
    const { onConfirm } = await render();

    expect(container.textContent).toContain('2 upcoming sessions will be cancelled');
    const confirm = () => $('danger-dialog-confirm') as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);

    await type('danger-dialog-password', 'hunter2');
    expect(confirm().disabled).toBe(true);
    await type('danger-dialog-confirm-word', 'delete');
    expect(confirm().disabled).toBe(false);

    await click('danger-dialog-confirm');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ method: 'password', password: 'hunter2' });
  });

  it('uses a verified email code for an account without a password', async () => {
    svc.deletionCheck.mockResolvedValue({ allowed: true, requiresProof: true, openBookings: 0, blockers: [], methods: methods(false) });
    svc.sendEmailCode.mockResolvedValue(undefined);
    svc.verifyEmailCode.mockResolvedValue(undefined);
    const { onConfirm } = await render();

    expect($('danger-dialog-method-password')).toBeNull(); // no password option offered
    await click('danger-dialog-send-code');
    expect(svc.sendEmailCode).toHaveBeenCalledWith('user@example.com');

    await type('danger-dialog-code', '123456');
    await click('danger-dialog-verify-code');
    expect(svc.verifyEmailCode).toHaveBeenCalledWith('user@example.com', '123456');
    expect($('danger-dialog-code-verified')).not.toBeNull();

    await type('danger-dialog-confirm-word', 'DELETE');
    await click('danger-dialog-confirm');
    expect(onConfirm).toHaveBeenCalledWith({ method: 'email_code' });
  });

  it('shows a wrong password from the server and asks for it again', async () => {
    svc.deletionCheck.mockResolvedValue({ allowed: true, requiresProof: true, openBookings: 0, blockers: [], methods: methods(true) });
    const onConfirm = vi.fn().mockRejectedValue(serverError(403, { error: 'That password is not correct.', code: 'STEP_UP_FAILED' }));
    await render({ onConfirm });

    await type('danger-dialog-password', 'wrong');
    await type('danger-dialog-confirm-word', 'DELETE');
    await click('danger-dialog-confirm');

    expect($('danger-dialog-error')?.textContent).toContain('That password is not correct.');
    expect(($('danger-dialog-password') as HTMLInputElement).value).toBe('');
    expect(($('danger-dialog-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('switches to the refusal view when the server reports a balance at submit time', async () => {
    svc.deletionCheck.mockResolvedValue({ allowed: true, requiresProof: true, openBookings: 0, blockers: [], methods: methods(true) });
    const onConfirm = vi.fn().mockRejectedValue(serverError(409, {
      error: 'Your account cannot be deleted yet',
      code: 'ACCOUNT_HAS_OPEN_BALANCE',
      details: { blockers: [{ code: 'ACCOUNT_HAS_OPEN_BALANCE', message: 'the wallet still holds 40 coins' }] },
    }));
    await render({ onConfirm });
    await type('danger-dialog-password', 'pw');
    await type('danger-dialog-confirm-word', 'DELETE');
    await click('danger-dialog-confirm');
    expect($('danger-dialog-blocked')?.textContent).toContain('the wallet still holds 40 coins');
  });

  it('asks the server which proofs exist for a reset, and says what is kept', async () => {
    svc.stepUpMethods.mockResolvedValue(methods(true));
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    await render({ action: 'reset-data', onConfirm });
    expect(svc.stepUpMethods).toHaveBeenCalled();
    expect(svc.deletionCheck).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Your coin wallet and its history');

    await type('danger-dialog-password', 'pw');
    await type('danger-dialog-confirm-word', 'RESET');
    await click('danger-dialog-confirm');
    expect(onConfirm).toHaveBeenCalledWith({ method: 'password', password: 'pw' });
  });
});
