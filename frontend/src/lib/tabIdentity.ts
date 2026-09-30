/**
 * An id for this browser tab (this page load).
 *
 * BroadcastChannel delivers a message to every OTHER channel object with the
 * same name — including ones in the sending tab. The sender's own AppContext
 * listener therefore reloaded the tab that had just deleted the account, before
 * that tab could navigate to sign-in, and it re-rendered the profile route for a
 * signed-out visitor. Messages carry this id so a tab ignores its own.
 */
export const TAB_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
