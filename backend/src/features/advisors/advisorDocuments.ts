import { randomUUID } from 'crypto';
import { uploadBuffer, downloadBuffer, removeObject } from '../../utils/storage';
import { validateUpload } from '../../utils/uploadPolicy';
import { AppError } from '../../utils/AppError';
import { encryptBufferForUser, decryptBufferForUser } from '../vault/vault.storage';

/**
 * Advisor KYC documents (PAN, Aadhaar, professional certificate).
 *
 * Three rules this module exists to enforce:
 *
 *   1. The file is judged by its bytes, not by the type the client declared.
 *      Android's file picker (Drive, Files, some galleries) hands the WebView a
 *      File with an empty type, which the browser sends as
 *      application/octet-stream — a perfectly good PDF was then refused as
 *      "only JPEG, PNG, WEBP, or PDF allowed". Conversely a declared image/png
 *      proved nothing about the content.
 *   2. The object in the bucket is ciphertext. The documents used to be stored
 *      as plaintext while the application form promised they were encrypted.
 *      They now go through the vault's AES-256-GCM per-user envelope, bound
 *      (AAD) to the document type and storage path so a ciphertext cannot be
 *      replayed as another document or another user's file. The vault helper is
 *      reused rather than a new key introduced so this adds no deploy-order
 *      dependency: when VAULT_/AA_ENCRYPTION_ROOT_KEY is unset it logs loudly
 *      and still encrypts, instead of breaking every application.
 *   3. No bearer URL is ever handed out. Documents are read back only through
 *      the authenticated, audited API route, never a Supabase signed URL.
 *
 * Objects written before 2026-09-30 are plaintext and have no `.enc` suffix;
 * they are still served, content-sniffed the same way.
 */

export const ADVISOR_DOC_TYPES = ['pan', 'aadhaar', 'cert'] as const;
export type AdvisorDocType = (typeof ADVISOR_DOC_TYPES)[number];

export const ADVISOR_DOC_LABELS: Record<AdvisorDocType, string> = {
  pan: 'PAN Card',
  aadhaar: 'Aadhaar Card',
  cert: 'Professional certificate',
};

const EXTENSION_TO_TYPE: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const ALLOWED_TYPES = new Set(Object.values(EXTENSION_TO_TYPE));
const ENCRYPTED_SUFFIX = '.enc';

export interface AdvisorDocument {
  docType: AdvisorDocType;
  buffer: Buffer;
  contentType: string;
  extension: string;
}

const detect = async (buffer: Buffer, nameHint: string) =>
  validateUpload({ buffer, originalname: nameHint, mimetype: '' } as Express.Multer.File)
    .then((validated) => (ALLOWED_TYPES.has(validated.contentType) ? validated : null))
    .catch(() => null);

/** Reject anything that is not, by content, a JPEG / PNG / WEBP / PDF. */
export const validateAdvisorDocument = async (
  file: Express.Multer.File,
  docType: AdvisorDocType,
): Promise<AdvisorDocument> => {
  const label = ADVISOR_DOC_LABELS[docType];
  if (!file.buffer?.length) {
    throw AppError.badRequest(`${label}: the file is empty. Please choose the document again.`, 'DOCUMENT_EMPTY');
  }
  const validated = await detect(file.buffer, file.originalname || docType);
  if (!validated) {
    throw AppError.badRequest(`${label} must be a PDF, JPG, PNG or WEBP file.`, 'DOCUMENT_UNSUPPORTED_TYPE');
  }
  return { docType, buffer: file.buffer, contentType: validated.contentType, extension: validated.extension };
};

const aadFor = (docType: AdvisorDocType, storagePath: string) => `kanaku/advisor-kyc/v1|${docType}|${storagePath}`;

/** Encrypts under the applicant's key and uploads; returns the storage path. */
export const storeAdvisorDocument = async (userId: string, doc: AdvisorDocument): Promise<string> => {
  const storagePath = `advisor-docs/${userId}/${doc.docType}-${randomUUID()}.${doc.extension}${ENCRYPTED_SUFFIX}`;
  const ciphertext = encryptBufferForUser(userId, doc.buffer, aadFor(doc.docType, storagePath));
  await uploadBuffer(storagePath, ciphertext, 'application/octet-stream');
  return storagePath;
};

/**
 * Uploads every document or none: if one upload fails the ones that landed are
 * removed, so a half-submitted application never strands PAN/Aadhaar copies in
 * the bucket with no row pointing at them.
 */
export const storeAdvisorDocuments = async (userId: string, docs: AdvisorDocument[]): Promise<Record<AdvisorDocType, string | null>> => {
  const results = await Promise.allSettled(docs.map((doc) => storeAdvisorDocument(userId, doc)));
  const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) {
    await removeAdvisorDocuments(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])));
    throw failure.reason;
  }
  const paths: Record<AdvisorDocType, string | null> = { pan: null, aadhaar: null, cert: null };
  docs.forEach((doc, i) => {
    paths[doc.docType] = (results[i] as PromiseFulfilledResult<string>).value;
  });
  return paths;
};

/** Best-effort delete; a failure here must never fail the caller's request. */
export const removeAdvisorDocuments = async (paths: Array<string | null | undefined>) => {
  await Promise.all(paths.filter((p): p is string => Boolean(p)).map((p) => removeObject(p).catch(() => undefined)));
};

/** Downloads (and, for current uploads, decrypts) a stored document. Null when the object is gone. */
export const readAdvisorDocument = async (
  ownerId: string,
  docType: AdvisorDocType,
  storagePath: string,
): Promise<Omit<AdvisorDocument, 'docType'> | null> => {
  const downloaded = await downloadBuffer(storagePath);
  if (!downloaded?.buffer) return null;

  if (storagePath.endsWith(ENCRYPTED_SUFFIX)) {
    const buffer = decryptBufferForUser(ownerId, downloaded.buffer, aadFor(docType, storagePath));
    const extension = storagePath.slice(0, -ENCRYPTED_SUFFIX.length).split('.').pop() ?? '';
    const contentType = EXTENSION_TO_TYPE[extension];
    if (contentType) return { buffer, contentType, extension };
    const sniffed = await detect(buffer, storagePath);
    return { buffer, contentType: sniffed?.contentType ?? 'application/octet-stream', extension: sniffed?.extension ?? 'bin' };
  }

  // Legacy plaintext object: trust neither the stored type nor the name.
  const sniffed = await detect(downloaded.buffer, storagePath);
  return {
    buffer: downloaded.buffer,
    contentType: sniffed?.contentType ?? 'application/octet-stream',
    extension: sniffed?.extension ?? 'bin',
  };
};
