import { Capacitor } from '@capacitor/core';

export type DownloadResult = 'shared' | 'downloaded' | 'opened' | 'cancelled';

const isNativeFileTarget = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

// Loaded lazily so the Filesystem/Share plugin code stays out of the web bundle,
// where this branch is never taken.
const loadNativeFiles = () => import('./nativeFiles');

interface DownloadOptions {
  filename: string;
  mimeType: string;
  data: Blob | string;
  preferShare?: boolean;
  shareTitle?: string;
}

interface ShareOptions {
  filename: string;
  mimeType: string;
  data: Blob | string;
  shareTitle?: string;
}

const isIOSDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const isIpadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isIOS || isIpadOS;
};

const createBlob = (data: Blob | string, mimeType: string) =>
  data instanceof Blob ? data : new Blob([data], { type: mimeType });

export const shareFile = async ({
  filename,
  mimeType,
  data,
  shareTitle,
}: ShareOptions): Promise<DownloadResult> => {
  // Android/iOS: navigator.share is absent (or cannot carry files) inside the
  // Capacitor WebView. Go through the native share sheet instead.
  if (isNativeFileTarget()) {
    try {
      const { saveAndShareFile } = await loadNativeFiles();
      const result = await saveAndShareFile({ filename, mimeType, data, shareTitle });
      return result.shared ? 'shared' : 'downloaded';
    } catch (error) {
      console.error('[Share] Native share failed:', error);
      return 'cancelled';
    }
  }

  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('share' in navigator)) {
    return 'cancelled';
  }

  const blob = createBlob(data, mimeType);
  const file = new File([blob], filename, { type: mimeType });
  const canShareFiles = typeof navigator.canShare === 'function'
    ? navigator.canShare({ files: [file] })
    : true;

  if (!canShareFiles) {
    return 'cancelled';
  }

  try {
    await navigator.share({
      files: [file],
      title: shareTitle ?? filename,
    });
    return 'shared';
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return 'cancelled';
    }
    return 'cancelled';
  }
};

export const downloadFile = async ({
  filename,
  mimeType,
  data,
  preferShare = true,
  shareTitle,
}: DownloadOptions): Promise<DownloadResult> => {
  if (typeof window === 'undefined') return 'downloaded';

  // Android/iOS: the blob-URL + <a download> path below is a no-op inside the
  // Capacitor WebView, so exports silently produced nothing. Write the file to
  // app storage and offer the system share sheet.
  if (isNativeFileTarget()) {
    try {
      const { saveAndShareFile } = await loadNativeFiles();
      const result = await saveAndShareFile({
        filename,
        mimeType,
        data,
        shareTitle,
        share: preferShare,
      });
      return result.shared ? 'shared' : 'downloaded';
    } catch (error) {
      console.error('[Download] Native file write failed:', error);
      return 'cancelled';
    }
  }

  const blob = createBlob(data, mimeType);

  if (preferShare && typeof navigator !== 'undefined' && 'share' in navigator) {
    const file = new File([blob], filename, { type: mimeType });
    const canShareFiles = typeof navigator.canShare === 'function'
      ? navigator.canShare({ files: [file] })
      : true;

    if (canShareFiles) {
      try {
        await navigator.share({
          files: [file],
          title: shareTitle ?? filename,
        });
        return 'shared';
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          return 'cancelled';
        }
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const cleanup = () => setTimeout(() => URL.revokeObjectURL(url), 30000);

  if (isIOSDevice()) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.href = url;
    }
    cleanup();
    return 'opened';
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  cleanup();

  return 'downloaded';
};
