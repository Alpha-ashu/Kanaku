import { useCallback, useRef } from 'react';

/**
 * One save at a time per form.
 *
 * A `disabled={isSaving}` button is not a submit lock. React state only changes
 * on the next render, and several triggers never look at the button at all:
 * an `onKeyDown` Enter handler, a key that auto-repeats, an Android keyboard
 * that delivers Enter twice, a form's native submit. Every one of those could
 * start a second save while the first was still waiting on the network, and
 * each save created its own record — the duplicate to-do tasks, transactions,
 * contributions and loans users kept finding.
 *
 * A ref flips synchronously, so the second trigger is refused in the same tick.
 *
 * Usage:
 *
 *   const guardSubmit = useSubmitLock();
 *   const handleSubmit = guardSubmit(async (e?: React.FormEvent) => { ... });
 *
 * The lock is released when the wrapped handler settles — success, error or an
 * early `return` alike — so a failed save can be retried straight away.
 */
export function useSubmitLock() {
  const lockedRef = useRef(false);

  return useCallback(
    <Args extends unknown[], Result>(handler: (...args: Args) => Promise<Result> | Result) =>
      async (...args: Args): Promise<Result | undefined> => {
        // A form event must still be cancelled on the refused trigger, or the
        // browser performs its default submit (a full page navigation).
        const maybeEvent = args[0] as { preventDefault?: () => void } | undefined;

        if (lockedRef.current) {
          if (maybeEvent && typeof maybeEvent.preventDefault === 'function') {
            maybeEvent.preventDefault();
          }
          return undefined;
        }

        lockedRef.current = true;
        try {
          return await handler(...args);
        } finally {
          lockedRef.current = false;
        }
      },
    [],
  );
}

/**
 * Enter-to-submit that ignores the Enter which only confirms an IME composition
 * (Tamil, Hindi, Japanese… keyboards), and the auto-repeat of a held key.
 */
export function isSubmitEnter(event: {
  key: string;
  shiftKey?: boolean;
  repeat?: boolean;
  nativeEvent?: { isComposing?: boolean };
}): boolean {
  return event.key === 'Enter'
    && !event.shiftKey
    && !event.repeat
    && !event.nativeEvent?.isComposing;
}
