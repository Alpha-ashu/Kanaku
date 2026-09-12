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
  answerClarification: (actionId: string, optionIndex: number) => Promise<void>;
  editAction: (actionId: string, patch: KaiEntityPatch) => Promise<void>;
  retryAction: (actionId: string) => Promise<void>;
  deleteAction: (actionId: string) => Promise<void>;
  dismissAction: (actionId: string) => void;
  clear: () => void;
  setMuted: (muted: boolean) => void;
}

export function useKaiSession(): KaiSessionApi {
  const session = useMemo(() => getKaiSession(), []);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { user } = useAuth();
  const { refreshData } = useApp();

  useEffect(() => {
    session.setUserId(user?.id);
  }, [session, user?.id]);

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
    answerClarification: (id, i) => session.answerClarification(id, i),
    editAction: (id, patch) => session.editAction(id, patch),
    retryAction: (id) => session.retryAction(id),
    deleteAction: (id) => session.deleteAction(id),
    dismissAction: (id) => session.dismissAction(id),
    clear: () => session.clear(),
    setMuted,
  };
}
