// @vitest-environment jsdom

/**
 * Client-side duplicate-submit guards.
 *
 *   coalesceCreate  — a repeat of the same create while the first is running
 *                     (or just finished) returns the first result.
 *   useSubmitLock   — a form refuses to start a second save while one is running,
 *                     including triggers that never look at a disabled button.
 *   isSubmitEnter   — Enter-to-submit that ignores IME confirmation and key repeat.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalizeSubmission, coalesceCreate, resetSubmitGuard } from '@/lib/submitGuard';
import { isSubmitEnter, useSubmitLock } from '@/hooks/useSubmitLock';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('coalesceCreate', () => {
  beforeEach(() => {
    resetSubmitGuard();
    vi.useRealTimers();
  });

  it('runs a create once when it is fired twice while in flight', async () => {
    const gate = deferred<{ id: number }>();
    const create = vi.fn(() => gate.promise);

    const first = coalesceCreate('todo-item', { listId: 3, title: 'Buy milk' }, create);
    const second = coalesceCreate('todo-item', { listId: 3, title: 'Buy milk' }, create);
    gate.resolve({ id: 11 });

    await expect(first).resolves.toEqual({ id: 11 });
    await expect(second).resolves.toEqual({ id: 11 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('absorbs a repeat that lands just after the first one finished', async () => {
    const create = vi.fn(async () => ({ id: 1 }));

    await coalesceCreate('todo-item', { listId: 3, title: 'Buy milk' }, create);
    await coalesceCreate('todo-item', { listId: 3, title: 'Buy milk' }, create);

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('runs again once the grace period is over', async () => {
    vi.useFakeTimers();
    const create = vi.fn(async () => ({ id: 1 }));

    await coalesceCreate('todo-item', { title: 'Water plants' }, create, 1_000);
    vi.advanceTimersByTime(1_500);
    await coalesceCreate('todo-item', { title: 'Water plants' }, create, 1_000);

    expect(create).toHaveBeenCalledTimes(2);
  });

  it('treats different content as different creates', async () => {
    const create = vi.fn(async () => ({}));

    await coalesceCreate('todo-item', { listId: 3, title: 'Buy milk' }, create);
    await coalesceCreate('todo-item', { listId: 3, title: 'Buy bread' }, create);
    await coalesceCreate('todo-item', { listId: 4, title: 'Buy milk' }, create);

    expect(create).toHaveBeenCalledTimes(3);
  });

  it('never merges across scopes', async () => {
    const create = vi.fn(async () => ({}));

    await coalesceCreate('goal', { name: 'Trip' }, create);
    await coalesceCreate('todo-list', { name: 'Trip' }, create);

    expect(create).toHaveBeenCalledTimes(2);
  });

  it('forgets a failed attempt so the retry really runs', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ id: 2 });

    await expect(coalesceCreate('transaction', { amount: 250 }, create)).rejects.toThrow('offline');
    await expect(coalesceCreate('transaction', { amount: 250 }, create)).resolves.toEqual({ id: 2 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('ignores per-attempt noise when comparing', async () => {
    const create = vi.fn(async () => ({}));

    await coalesceCreate('transaction', {
      amount: 250, category: 'Food', description: 'Lunch',
      date: new Date('2026-09-16T10:00:00.100Z'), createdAt: new Date(), clientRequestId: 'a',
    }, create);
    await coalesceCreate('transaction', {
      amount: 250, category: 'Food', description: ' lunch ',
      date: new Date('2026-09-16T10:00:00.400Z'), createdAt: new Date(), clientRequestId: 'b',
    }, create);

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps an explicit caller identity, so two separate actions stay two', async () => {
    const create = vi.fn(async () => ({}));

    // KAI gives every spoken action its own deterministic key.
    await coalesceCreate('transaction', { amount: 50, description: 'Coffee', callerKey: 'action-1' }, create);
    await coalesceCreate('transaction', { amount: 50, description: 'Coffee', callerKey: 'action-2' }, create);

    expect(create).toHaveBeenCalledTimes(2);
  });

  it('canonicalises to a key-order-independent form', () => {
    expect(JSON.stringify(canonicalizeSubmission({ b: 1, a: 'X' })))
      .toBe(JSON.stringify(canonicalizeSubmission({ a: 'x', b: 1 })));
  });
});

describe('useSubmitLock', () => {
  let container: HTMLDivElement;
  let root: Root;
  let guard!: ReturnType<typeof useSubmitLock>;

  const Harness = () => {
    guard = useSubmitLock();
    return null;
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('refuses a second trigger while the first save is still running', async () => {
    const gate = deferred<void>();
    const save = vi.fn(() => gate.promise);
    const handleSubmit = guard(save);

    const first = handleSubmit();
    const second = handleSubmit(); // e.g. Enter pressed again during the round trip
    gate.resolve();
    await Promise.all([first, second]);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('shares one lock across handler instances from different renders', async () => {
    const gate = deferred<void>();
    const save = vi.fn(() => gate.promise);

    // Each render wraps a fresh closure; the lock must still be the same one.
    const fromRenderOne = guard(save);
    const fromRenderTwo = guard(save);
    const a = fromRenderOne();
    const b = fromRenderTwo();
    gate.resolve();
    await Promise.all([a, b]);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('releases after a failure so the user can retry immediately', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    const handleSubmit = guard(save);

    await expect(handleSubmit()).rejects.toThrow('network');
    await handleSubmit();

    expect(save).toHaveBeenCalledTimes(2);
  });

  it('cancels the default action of a refused form submit', async () => {
    const gate = deferred<void>();
    const handleSubmit = guard(async (_event: { preventDefault: () => void }) => gate.promise);

    const firstEvent = { preventDefault: vi.fn() };
    const refusedEvent = { preventDefault: vi.fn() };
    const first = handleSubmit(firstEvent);
    await handleSubmit(refusedEvent);
    gate.resolve();
    await first;

    // Otherwise the browser performs a real navigation for the refused submit.
    expect(refusedEvent.preventDefault).toHaveBeenCalled();
  });
});

describe('isSubmitEnter', () => {
  it('accepts a plain Enter', () => {
    expect(isSubmitEnter({ key: 'Enter' })).toBe(true);
  });

  it('ignores Shift+Enter', () => {
    expect(isSubmitEnter({ key: 'Enter', shiftKey: true })).toBe(false);
  });

  it('ignores a held Enter that auto-repeats', () => {
    expect(isSubmitEnter({ key: 'Enter', repeat: true })).toBe(false);
  });

  it('ignores the Enter that only confirms an IME composition', () => {
    expect(isSubmitEnter({ key: 'Enter', nativeEvent: { isComposing: true } })).toBe(false);
  });

  it('ignores other keys', () => {
    expect(isSubmitEnter({ key: 'a' })).toBe(false);
  });
});
