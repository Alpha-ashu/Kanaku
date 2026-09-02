import { db, type DocumentRecord } from '@/lib/database';
import { documentIntelligenceService, getActiveUserId } from './documentIntelligenceService';
import { enqueueFileUpload } from '@/lib/offlineUploadQueue';

export class DocumentManagementService {
  async createDocumentRecord(file: File, accountId?: number): Promise<number> {
    const docId = await documentIntelligenceService.createDocumentRecord({
      documentType: 'receipt',
      file,
      processingStatus: 'processing',
      accountId: accountId ?? undefined,
    });

    try {
      const userId = (await getActiveUserId()) || 'local_user';
      await enqueueFileUpload({
        file,
        fileName: file.name,
        userId,
        documentId: docId,
      });
    } catch (queueErr) {
      console.warn('[DocumentManagementService] Failed to queue offline upload:', queueErr);
    }

    return docId;
  }

  async updateDocumentStatus(
    documentId: number,
    status: DocumentRecord['processingStatus'],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await documentIntelligenceService.updateDocumentRecord(documentId, {
      processingStatus: status,
      ...metadata,
    });
  }

  async linkTransaction(documentId: number, transactionId: number): Promise<void> {
    await db.transaction('rw', db.documents, db.transactions, db.pendingFileUploads, async () => {
      const transaction = await db.transactions.get(transactionId);
      const document = await db.documents.get(documentId);
      const importMetadata = {
        ...(transaction?.importMetadata ?? {}),
        'Document Id': String(documentId),
      };

      await documentIntelligenceService.updateDocumentRecord(documentId, {
        processingStatus: 'completed',
        linkedTransactionId: transactionId,
        metadata: {
          ...(document?.metadata ?? {}),
          'Document Id': String(documentId),
        },
      });

      // Prefer canonical cloud attachment reference if already uploaded
      const canonicalAttachment = document?.cloudId
        ? `bill:${document.cloudId}`
        : `document:${documentId}`;

      if (transaction?.id) {
        await db.transactions.update(transaction.id, {
          attachment: canonicalAttachment,
          importMetadata,
          updatedAt: new Date(),
        });
      }

      // If upload is still pending in queue, associate the transactionLocalId so
      // it updates attachment to bill:<uuid> as soon as it uploads.
      if (db.pendingFileUploads) {
        const pending = await db.pendingFileUploads
          .where('documentId')
          .equals(documentId)
          .first();

        if (pending?.id) {
          await db.pendingFileUploads.update(pending.id, {
            transactionLocalId: transactionId,
            updatedAt: new Date(),
          });
        }
      }
    });
  }

  async markAsFailed(documentId: number): Promise<void> {
    await documentIntelligenceService.updateDocumentRecord(documentId, {
      processingStatus: 'failed',
    });
  }

  async getDocument(documentId: number): Promise<DocumentRecord | undefined> {
    return db.documents.get(documentId);
  }

  async getLinkedReceipt(transactionId: number): Promise<DocumentRecord | undefined> {
    return db.documents
      .filter((document) => document.documentType === 'receipt' && document.linkedTransactionId === transactionId)
      .first();
  }

  /**
   * Migrate legacy local-only attachments (`document:<id>`) to the cloud.
   * Finds any local transactions referencing documents that have not yet uploaded,
   * and queues them into the offline upload queue.
   */
  async migrateLegacyLocalAttachments(): Promise<void> {
    try {
      const userId = (await getActiveUserId()) || 'local_user';
      const transactions = await db.transactions.toArray();

      for (const tx of transactions) {
        if (!tx.id || !tx.attachment) continue;
        const match = tx.attachment.match(/^document:(\d+)$/);
        if (!match) continue;

        const docId = parseInt(match[1], 10);
        if (!Number.isFinite(docId)) continue;

        const doc = await db.documents.get(docId);
        if (doc?.cloudId) {
          // Already has a cloudId, simply update the pointer
          await db.transactions.update(tx.id, {
            attachment: `bill:${doc.cloudId}`,
            updatedAt: new Date(),
          });
        } else if (doc?.fileData) {
          // Has raw local file blob: enqueue for upload
          const existingQueue = await db.pendingFileUploads
            .where('documentId')
            .equals(docId)
            .first();

          if (!existingQueue) {
            await enqueueFileUpload({
              file: doc.fileData,
              fileName: doc.fileName || `attachment-${docId}.jpg`,
              userId,
              documentId: docId,
              transactionLocalId: tx.id,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[DocumentManagementService] Migration error:', err);
    }
  }
}
