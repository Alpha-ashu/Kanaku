import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { socketClient } from '@/lib/socket-client';
import {
  AdvisorDocType,
  LoadedAdvisorDocument,
  describeApiFailure,
  fetchAdvisorDocument,
} from '@/services/advisorApplicationService';

/** Shared by the Manager and Admin advisor-verification queues. */

interface ViewerState {
  title: string;
  subtitle?: string;
  document: LoadedAdvisorDocument | null;
}

/**
 * Loads one KYC document into memory for the in-page viewer and releases the
 * decrypted copy (the object URL) as soon as the viewer closes or the page
 * unmounts, so an identity document does not outlive the look at it.
 */
export function useAdvisorDocumentViewer() {
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const currentUrl = useRef<string | null>(null);

  const release = useCallback(() => {
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = null;
  }, []);

  useEffect(() => release, [release]);

  const openDocument = useCallback(async (applicationId: string, docType: AdvisorDocType, title: string, subtitle?: string) => {
    setLoadingKey(`${applicationId}:${docType}`);
    let document: LoadedAdvisorDocument | null = null;
    try {
      document = await fetchAdvisorDocument(applicationId, docType);
    } catch (err) {
      toast.error((await describeApiFailure(err, 'Could not load the document')).message);
    } finally {
      setLoadingKey(null);
    }
    release();
    currentUrl.current = document?.url ?? null;
    setViewer({ title, subtitle, document });
  }, [release]);

  const closeDocument = useCallback(() => {
    release();
    setViewer(null);
  }, [release]);

  return { viewer, loadingKey, openDocument, closeDocument };
}

/**
 * Refreshes the queue when an application arrives. The backend notifies every
 * reviewer through notify(), which also emits the notification on their
 * socket; a reviewer with the queue open used to see a new application only
 * after reloading. Focus / tab-return covers the case where realtime is down.
 */
export function useAdvisorQueueLiveRefresh(refresh: () => void, enabled: boolean) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const unsubscribe = socketClient.on('notification', (payload: { type?: string } | undefined) => {
      if (payload?.type === 'advisor_application_submitted') latest.current();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') latest.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled]);
}
