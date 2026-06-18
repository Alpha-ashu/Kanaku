import path from 'path';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedFileTypeFromBuffer: ((buffer: Buffer) => Promise<{ mime: string; ext: string } | undefined>) | null = null;

const getFileTypeFromBuffer = async (): Promise<(buffer: Buffer) => Promise<{ mime: string; ext: string } | undefined>> => {
  if (cachedFileTypeFromBuffer) return cachedFileTypeFromBuffer;
  // file-type v22+ is ESM-only; use dynamic import with type assertion
  const mod = await import('file-type' as string) as { fileTypeFromBuffer: (buffer: Buffer) => Promise<{ mime: string; ext: string } | undefined> };
  cachedFileTypeFromBuffer = mod.fileTypeFromBuffer;
  return cachedFileTypeFromBuffer;
};

export const MAX_UPLOAD_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
export const BILL_MAX_UPLOAD_BYTES = Number(process.env.BILL_UPLOAD_MAX_BYTES || 5 * 1024 * 1024);

const BILL_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.js',
  '.bat',
  '.php',
  '.sh',
  '.apk',
]);

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const DOC_MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
};

const CSV_MIME_CANDIDATES = new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel']);

const DOCX_EXTENSION = '.docx';
const XLSX_EXTENSION = '.xlsx';
const DOC_EXTENSION = '.doc';
const XLS_EXTENSION = '.xls';
const CSV_EXTENSION = '.csv';
const PDF_EXTENSION = '.pdf';

export type ValidatedUpload = {
  kind: 'image' | 'document';
  originalName: string;
  contentType: string;
  extension: string;
  buffer: Buffer;
};

export const makeStoragePath = (userId: string, extension: string, transactionId?: string | null) => {
  const safeExtension = extension.replace(/^\./, '');
  const safeTransaction = transactionId ? transactionId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
  const scope = safeTransaction ? `tx-${safeTransaction}` : 'general';
  return `${userId}/${scope}/${crypto.randomUUID()}.${safeExtension}`;
};

const sanitizeFilename = (value: string) => {
  const cleaned = value
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || `upload-${Date.now()}`;
};

const isPdfBuffer = (buffer: Buffer) => buffer.slice(0, 5).toString('utf8') === '%PDF-';

const isProbablyText = (buffer: Buffer) => {
  const sample = buffer.slice(0, Math.min(buffer.length, 4096));
  let nonPrintable = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) nonPrintable += 1;
  }
  return nonPrintable / sample.length < 0.1;
};

export const validateUpload = async (file: Express.Multer.File): Promise<ValidatedUpload> => {
  const originalName = sanitizeFilename(path.basename(file.originalname || 'upload'));
  const extension = path.extname(originalName).toLowerCase();

  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw new Error('Executable files are not allowed');
  }

  const fileTypeFromBuffer = await getFileTypeFromBuffer();
  const detected = await fileTypeFromBuffer(file.buffer);
  const detectedMime = detected?.mime;
  const isUnknownMime = !detectedMime || detectedMime === 'application/octet-stream';

  if (detectedMime && IMAGE_MIME_TO_EXT[detectedMime]) {
    return {
      kind: 'image',
      originalName,
      contentType: detectedMime,
      extension: IMAGE_MIME_TO_EXT[detectedMime],
      buffer: file.buffer,
    };
  }

  if (detectedMime === 'application/pdf' || (extension === PDF_EXTENSION && isPdfBuffer(file.buffer))) {
    return {
      kind: 'document',
      originalName,
      contentType: 'application/pdf',
      extension: 'pdf',
      buffer: file.buffer,
    };
  }

  if (extension === CSV_EXTENSION && (CSV_MIME_CANDIDATES.has(file.mimetype) || isUnknownMime) && isProbablyText(file.buffer)) {
    return {
      kind: 'document',
      originalName,
      contentType: 'text/csv',
      extension: 'csv',
      buffer: file.buffer,
    };
  }

  if (detectedMime === 'application/zip' && (extension === DOCX_EXTENSION || extension === XLSX_EXTENSION)) {
    return {
      kind: 'document',
      originalName,
      contentType: extension === DOCX_EXTENSION
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: extension.replace('.', ''),
      buffer: file.buffer,
    };
  }

  if (detectedMime === 'application/x-cfb' && (extension === DOC_EXTENSION || extension === XLS_EXTENSION)) {
    return {
      kind: 'document',
      originalName,
      contentType: extension === DOC_EXTENSION ? 'application/msword' : 'application/vnd.ms-excel',
      extension: extension.replace('.', ''),
      buffer: file.buffer,
    };
  }

  if (detectedMime && DOC_MIME_TO_EXT[detectedMime]) {
    return {
      kind: 'document',
      originalName,
      contentType: detectedMime,
      extension: DOC_MIME_TO_EXT[detectedMime],
      buffer: file.buffer,
    };
  }

  throw new Error('Unsupported or corrupted file');
};

export const validateBillUpload = async (file: Express.Multer.File): Promise<ValidatedUpload> => {
  if (file.size > BILL_MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${Math.round(BILL_MAX_UPLOAD_BYTES / (1024 * 1024))}MB limit`);
  }

  const validated = await validateUpload(file);
  if (!BILL_ALLOWED_MIME_TYPES.has(validated.contentType)) {
    throw new Error('Only PNG, JPG, and PDF files are allowed for bill uploads');
  }

  return validated;
};
