import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { KaiEntityPatch } from '@kanaku/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { getKaiSession, type KaiSessionSnapshot } from '@/services/kai/kaiSession';
import { setKaiMuted } from '@/services/kai/kaiSpeech';

export interface KaiSessionApi extends KaiSessionSnapshot {
  toggleListening: () => Promise<void>;
  stop: () => Promise<void>;
  submitText: (text: string) => void;
  /** Write a held draft (the card's Confirm button). */
  confirmAction: (actionId: string) => Promise<void>;
  /** Drop a held draft without writing it. */
  cancelAction: (actionId: string) => Promise<void>;
  /** Write every draft this request produced. */
  confirmDrafts: () => Promise<void>;
  /** Drop every draft this request produced. */
  cancelDrafts: () => Promise<void>;
  answerClarification: (actionId: string, optionIndex: number) => Promise<void>;
  editAction: (actionId: string, patch: KaiEntityPatch) => Promise<void>;
  retryAction: (actionId: string) => Promise<void>;
  deleteAction: (actionId: string) => Promise<void>;
  dismissAction: (actionId: string) => void;
  clear: () => void;
  setMuted: (muted: boolean) => void;
}

export interface UseKaiSessionOptions {
  /** Where an utterance that is conversation, not capture, should be answered. */
  onConversation?: (transcript: string) => void;
}

export function useKaiSession(options: UseKaiSessionOptions = {}): KaiSessionApi {
  const session = useMemo(() => getKaiSession(), []);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { user } = useAuth();
  const { refreshData } = useApp();
  const { onConversation } = options;

  useEffect(() => {
    session.setUserId(user?.id);
  }, [session, user?.id]);

  useEffect(() => {
    session.setConversationHandler(onConversation);
    return () => session.setConversationHandler(undefined);
  }, [session, onConversation]);

  useEffect(() => {
    // Let the rest of the app (dashboard, transactions) pick up Kai's records.
    session.setRecordsChangedHandler(() => refreshData());
    return () => session.setRecordsChangedHandler(undefined);
  }, [session, refreshData]);

  const setMuted = useCallback((muted: boolean) => {
    setKaiMuted(muted);
    session.setMuted(muted);
  }, [session]);

  return {
    ...snapshot,
    toggleListening: () => session.toggleListening(),
    stop: () => session.stop(),
    submitText: (text) => session.submitText(text),
    confirmAction: (id) => session.confirmAction(id),
    cancelAction: (id) => session.cancelAction(id),
    confirmDrafts: () => session.confirmDrafts(),
    cancelDrafts: () => session.cancelDrafts(),
    answerClarification: (id, i) => session.answerClarification(id, i),
    editAction: (id, patch) => session.editAction(id, patch),
    retryAction: (id) => session.retryAction(id),
    deleteAction: (id) => session.deleteAction(id),
    dismissAction: (id) => session.dismissAction(id),
    clear: () => session.clear(),
    setMuted,
  };
}
