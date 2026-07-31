/**
 * File delivery on Android/iOS.
 *
 * On the web, `downloadFile()` in ./download.ts hands the browser a blob URL and
 * an `<a download>` click. Neither Capacitor WebView honours that: Android's
 * WebView ignores the `download` attribute for blob: URLs (there is no
 * DownloadListener wired to the bridge), and WKWebView opens the blob in a tab
 * that immediately dies with the object URL. Report exports and bill downloads
 * therefore appeared to "work" — no error, no file.
 *
 * The native path writes the payload into the app's own Documents/Cache
 * directory and then hands the resulting file:// URI to the system share sheet,
 * which is the only sanctioned way to get a file out of a sandboxed app on both
 * platforms.
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface NativeSaveOptions {
  filename: string;
  mimeType: string;
  data: Blob | string;
  shareTitle?: string;
  /** Open the share sheet after writing. Set false to only persist the file. */
  share?: boolean;
}

export interface NativeSaveResult {
  /** Absolute file:// URI of the written file. */
  uri: string;
  /** Whether the share sheet was presented and not dismissed. */
  shared: boolean;
}

export const isNativeFileTarget = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/**
 * Filesystem.writeFile takes base64 for binary data. FileReader gives us the
 * data URL in one step and handles arbitrary blob sizes without building a giant
 * intermediate string by hand.
 */
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file data'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const separator = result.indexOf(',');
      resolve(separator >= 0 ? result.slice(separator + 1) : result);
    };
    reader.readAsDataURL(blob);
  });

/** Strips characters that are illegal in file names on either platform. */
const sanitizeFilename = (filename: string): string => {
  const cleaned = filename.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned || `kanaku-export-${Date.now()}`;
};

/** Text formats can be written directly; everything else goes through base64. */
const isTextualMimeType = (mimeType: string): boolean =>
  /^text\//i.test(mimeType) || /(json|csv|xml|javascript)$/i.test(mimeType);

/**
 * Writes a file into app storage and (optionally) opens the share sheet.
 * Throws if the write fails — callers surface that to the user instead of
 * reporting a success that never happened.
 */
export const saveAndShareFile = async ({
  filename,
  mimeType,
  data,
  shareTitle,
  share = true,
}: NativeSaveOptions): Promise<NativeSaveResult> => {
  const safeName = sanitizeFilename(filename);
  const isText = typeof data === 'string' && isTextualMimeType(mimeType);

  // Cache, NOT Documents.
  //
  // Capacitor maps Directory.Documents on Android to
  // Environment.getExternalStoragePublicDirectory(DIRECTORY_DOCUMENTS) — *public*
  // shared storage. The Filesystem plugin treats that as a public directory and
  // requests READ/WRITE_EXTERNAL_STORAGE at runtime, which this app does not declare
  // (and which scoped storage neuters on Android 10+ anyway). Android resolves a
  // request for an undeclared permission to DENIED with no prompt, so the write
  // rejects and the export silently produces nothing — the exact failure this module
  // exists to fix.
  //
  // Cache is app-private, needs no permission on either platform, and is already
  // covered by the <cache-path> root in android/app/src/main/res/xml/file_paths.xml,
  // which is what @capacitor/share needs to hand the file to another app. The file
  // only has to survive long enough to reach the share sheet; the user chooses where
  // it lands from there.
  const directory = Directory.Cache;

  const writeResult = await Filesystem.writeFile(
    isText
      ? { path: safeName, data: data as string, directory, encoding: Encoding.UTF8, recursive: true }
      : {
          path: safeName,
          data: await blobToBase64(data instanceof Blob ? data : new Blob([data], { type: mimeType })),
          directory,
          recursive: true,
        },
  );

  if (!share) {
    return { uri: writeResult.uri, shared: false };
  }

  try {
    await Share.share({
      title: shareTitle ?? safeName,
      files: [writeResult.uri],
      dialogTitle: shareTitle ?? 'Share export',
    });
    return { uri: writeResult.uri, shared: true };
  } catch (error) {
    // A dismissed share sheet rejects on both platforms. The file is already on
    // disk, so this is a success from the user's point of view.
    const message = error instanceof Error ? error.message : String(error);
    if (!/cancel/i.test(message)) {
      console.warn('[NativeFiles] Share sheet failed:', message);
    }
    return { uri: writeResult.uri, shared: false };
  }
};
