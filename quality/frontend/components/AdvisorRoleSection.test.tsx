// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post, toastError, toastSuccess } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock('@/lib/backend-api', () => ({ backendService: { api: { get, post } } }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));

// lucide-react and framer-motion resolve the root React 18 copy; stub them so
// only frontend's React renders (same approach as PricingPage.test.tsx).
vi.mock('lucide-react', () => Object.fromEntries(
  ['Briefcase', 'ChevronDown', 'ChevronUp', 'CheckCircle2', 'Clock', 'XCircle', 'Upload', 'FileText', 'AlertTriangle',
    'Loader2', 'ToggleLeft', 'ToggleRight', 'Wifi', 'WifiOff', 'Minus', 'Star', 'Shield'].map((name) => [name, () => null]),
));
vi.mock('framer-motion', async () => {
  const { createElement } = await import('react');
  const strip = ({ initial: _i, animate: _a, exit: _e, transition: _t, ...rest }: Record<string, unknown>) => rest;
  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    motion: new Proxy({}, {
      get: (_target, tag: string) => ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
        createElement(tag, strip(props), children),
    }),
  };
});

import { AdvisorRoleSection } from '@/app/components/profile/AdvisorRoleSection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rejected = {
  id: 'app-1',
  fullName: 'Priya Raman',
  email: 'priya@example.com',
  phone: '+91 98765 43210',
  experienceYears: 6,
  expertise: 'Tax Planning',
  bio: 'Chartered accountant.',
  status: 'REJECTED',
  rejectionReason: 'Aadhaar scan is illegible',
  submittedAt: '2026-09-20T10:00:00.000Z',
};

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('AdvisorRoleSection', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async () => {
    await act(async () => {
      root.render(<AdvisorRoleSection userRole="user" userName="Priya Raman" userEmail="priya@example.com" />);
    });
    await flush();
  };

  const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('lets a rejected applicant open the form again from "Resubmit Application"', async () => {
    get.mockResolvedValue({ data: { application: rejected, isApproved: false, roleMode: 'user', advisorStatus: 'NOT_AVAILABLE' } });
    await render();

    expect(container.textContent).toContain('Aadhaar scan is illegible');
    expect(byTestId('advisor-role-section-form')).toBeNull();

    await act(async () => {
      byTestId('advisor-role-section-resubmit-application')!.click();
    });

    // Before the fix the status card always won and this button did nothing.
    expect(byTestId('advisor-role-section-form')).not.toBeNull();
  });

  it("shows the server's reason for a refused submission, not a generic failure", async () => {
    get.mockResolvedValue({ data: { application: rejected, isApproved: false, roleMode: 'user', advisorStatus: 'NOT_AVAILABLE' } });
    await render();
    await act(async () => {
      byTestId('advisor-role-section-resubmit-application')!.click();
    });

    const setFile = async (index: number, file: File) => {
      const input = container.querySelectorAll<HTMLInputElement>('[data-testid="advisor-role-section-upload"]')[index];
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };
    await setFile(0, new File(['%PDF-1.4'], 'pan.pdf', { type: 'application/pdf' }));
    await setFile(1, new File(['%PDF-1.4'], 'aadhaar.pdf', { type: 'application/pdf' }));
    await act(async () => {
      (byTestId('advisor-role-section-checkbox') as HTMLInputElement).click();
    });

    // What backendService's interceptor actually rejects with.
    post.mockRejectedValue(Object.assign(new Error('Some of your inputs look incorrect.'), {
      status: 400,
      original: {
        isAxiosError: true,
        response: { status: 400, data: { error: 'Enter a valid mobile number', code: 'VALIDATION_ERROR', field: 'phone' } },
      },
    }));
    await act(async () => {
      byTestId('advisor-role-section-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(post).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith('Enter a valid mobile number');
    expect(toastError).not.toHaveBeenCalledWith('Submission failed. Please try again.');
  });

  it('refuses an oversized document as soon as it is picked', async () => {
    get.mockResolvedValue({ data: { application: rejected, isApproved: false, roleMode: 'user', advisorStatus: 'NOT_AVAILABLE' } });
    await render();
    await act(async () => {
      byTestId('advisor-role-section-resubmit-application')!.click();
    });

    const big = new File(['x'], 'pan.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    const input = container.querySelector<HTMLInputElement>('[data-testid="advisor-role-section-upload"]')!;
    Object.defineProperty(input, 'files', { value: [big], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/larger than 10 MB/));
    expect(container.textContent).not.toContain('pan.pdf');
  });
});
