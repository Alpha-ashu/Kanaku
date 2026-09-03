import { db, type PendingFileUpload } from './database';
import { backendService } from './backend-api';

const MAX_QUEUE_RETRIES = 10;
let isProcessing = false;
let autoDrainTimer: any = null;

/**
 * Compute SHA-256 hash of a Blob/File using Web Crypto API.
 */
export async function computeFileSha256(blob: Blob): Promise<string> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('[OfflineUploadQueue] crypto.subtle failed, falling back to pseudo-hash', err);
    return `${blob.size}_${blob.type}_${Date.now()}`;
  }
}

/**
 * Enqueue a file upload into the persistent IndexedDB queue.
 * Survives browser reloads, app restarts, and offline periods.
 */
export async function enqueueFileUpload(params: {
  file: File | Blob;
  fileName: string;
  userId: string;
  transactionLocalId?: number;
  documentId?: number;
}): Promise<PendingFileUpload> {
  const sha256 = await computeFileSha256(params.file);
  const now = new Date();
  const localId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const item: PendingFileUpload = {
    localId,
    userId: params.userId,
    fileName: params.fileName,
    fileType: params.file.type || 'application/octet-stream',
    fileSize: params.file.size,
    fileBlob: params.file,
    sha256,
    transactionLocalId: params.transactionLocalId,
    documentId: params.documentId,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const id = await db.pendingFileUploads.add(item);
  item.id = id;

  console.info('UPLOAD_STARTED', {
    localId,
    userId: params.userId,
    fileName: params.fileName,
    fileSize: params.file.size,
    sha256,
  });

  // Attempt to drain queue immediately if online
  if (navigator.onLine) {
    setTimeout(() => {
      processUploadQueue().catch((err) => {
        console.warn('[OfflineUploadQueue] Immediate drain attempt failed:', err);
      });
    }, 50);
  }

  return item;
}

/**
 * Process and drain all pending file uploads in the queue.
 */
export async function processUploadQueue(): Promise<void> {
  if (isProcessing) return;
  if (!navigator.onLine) return;

  isProcessing = true;
  try {
    const pending = await db.pendingFileUploads.toArray();
    if (pending.length === 0) return;

    for (const item of pending) {
      if ((item.retryCount ?? 0) >= MAX_QUEUE_RETRIES) {
        console.warn('[OfflineUploadQueue] Max retries reached for item:', item.localId);
        continue;
      }

      try {
        console.info('UPLOAD_RETRY', {
          localId: item.localId,
          userId: item.userId,
          attempt: (item.retryCount ?? 0) + 1,
        });

        // Convert stored Blob back to File (or retain as Blob if File constructor is unavailable)
        let file: File | Blob;
        try {
          file = item.fileBlob instanceof File
            ? item.fileBlob
            : new File([item.fileBlob], item.fileName, {
                type: item.fileType,
                lastModified: item.createdAt instanceof Date ? item.createdAt.getTime() : Date.now(),
              });
        } catch {
          file = item.fileBlob;
        }

        // If there is a linked transaction, find its cloudId
        let transactionCloudId: string | undefined;
        if (item.transactionLocalId) {
          const tx = await db.transactions.get(item.transactionLocalId);
          if (tx?.cloudId) {
            transactionCloudId = tx.cloudId;
          }
        }

        // Upload to backend
        const uploaded = await backendService.uploadExpenseBill({
          transactionId: transactionCloudId,
          file,
          fileName: item.fileName,
        });

        if (!uploaded?.id) {
          throw new Error('Backend upload returned invalid bill record');
        }

        const billId = uploaded.id;
        const canonicalAttachment = `bill:${billId}`;

        console.info('UPLOAD_SUCCESS', {
          localId: item.localId,
          billId,
          userId: item.userId,
        });

        // 1. If linked to a local DocumentRecord, update it with the cloudId
        if (item.documentId) {
          await db.documents.update(item.documentId, {
            cloudId: billId,
            filePath: uploaded.storagePath,
            downloadUrl: uploaded.downloadUrl,
            processingStatus: 'completed',
            syncStatus: 'synced',
            updatedAt: new Date(),
          });
        }

        // 2. If linked to a local transaction, update its attachment to canonical cloud bill
        if (item.transactionLocalId) {
          const tx = await db.transactions.get(item.transactionLocalId);
          if (tx) {
            await db.transactions.update(item.transactionLocalId, {
              attachment: canonicalAttachment,
              updatedAt: new Date(),
            });
            console.info('ATTACHMENT_SYNCED', {
              transactionId: item.transactionLocalId,
              attachment: canonicalAttachment,
            });
          }
        }

        // Successfully uploaded: remove from pending queue
        if (item.id) {
          await db.pendingFileUploads.delete(item.id);
        }
      } catch (uploadError: any) {
        console.error('UPLOAD_FAILED', {
          localId: item.localId,
          error: uploadError?.message || uploadError,
        });

        if (item.id) {
          await db.pendingFileUploads.update(item.id, {
            retryCount: (item.retryCount || 0) + 1,
            lastError: uploadError?.message || String(uploadError),
            updatedAt: new Date(),
          });
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Initialize auto-drain listeners on app startup.
 */
export function initOfflineUploadQueue(): () => void {
  const onOnline = () => {
    processUploadQueue().catch((err) => console.warn('[OfflineUploadQueue] Drain on online error:', err));
  };

  window.addEventListener('online', onOnline);

  // Periodic check every 30 seconds if online
  autoDrainTimer = setInterval(() => {
    if (navigator.onLine) {
      processUploadQueue().catch(() => {});
    }
  }, 30_000);

  // Initial trigger
  if (navigator.onLine) {
    setTimeout(() => {
      processUploadQueue().catch(() => {});
    }, 2000);
  }

  return () => {
    window.removeEventListener('online', onOnline);
    if (autoDrainTimer) clearInterval(autoDrainTimer);
  };
}
