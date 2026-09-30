import { backendService } from '@/lib/backend-api';

/**
 * Advisor application: submitting one, and reading its KYC documents back.
 *
 * Kept apart from the components because three screens share it (the
 * applicant's profile section and the Manager and Admin verification queues),
 * and because each of them used to read `err.response.data.error` — which is
 * never set: backendService's interceptor rejects with its own Error and keeps
 * the axios error on `.original`. So every failure, including "You already have
 * a pending application" and "File exceeds 10MB limit", surfaced as the same
 * "Submission failed. Please try again."
 */

export type AdvisorDocType = 'pan' | 'aadhaar' | 'cert';

/** Mirrors the backend's MAX_UPLOAD_BYTES for this route. */
export const ADVISOR_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Above the server's 120 s budget for this route, so a slow upload is answered
 * by the server rather than abandoned by the client. At the default 15 s the
 * client gave up on ordinary mobile uploads while the server went on to save
 * the application — the user saw an error for a submission that had succeeded.
 */
const APPLY_TIMEOUT_MS = 150_000;
const DOCUMENT_TIMEOUT_MS = 60_000;

const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const ACCEPTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);

/**
 * Refuses an obviously unusable file before a long upload. Not a security
 * check — the server judges every document by its bytes. A missing type (or
 * octet-stream) and a missing extension are normal from Android's file picker,
 * so only a type or extension that is present AND wrong is refused here.
 */
export function checkAdvisorDocument(file: File, label: string): string | null {
  if (file.size === 0) return `${label}: the file is empty. Please choose it again.`;
  if (file.size > ADVISOR_DOCUMENT_MAX_BYTES) {
    return `${label} is larger than 10 MB. Please upload a smaller scan or photo.`;
  }
  const declared = file.type && file.type !== 'application/octet-stream' ? file.type : '';
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if ((declared && !ACCEPTED_TYPES.has(declared)) || (extension && !ACCEPTED_EXTENSIONS.has(extension))) {
    return `${label} must be a PDF, JPG, PNG or WEBP file.`;
  }
  return null;
}

export { describeApiFailure } from '@/lib/apiFailure';
export type { ApiFailure } from '@/lib/apiFailure';

export async function submitAdvisorApplication(form: FormData, onProgress?: (percent: number) => void): Promise<void> {
  await backendService.api.post('/advisors/apply', form, {
    timeout: APPLY_TIMEOUT_MS,
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    },
  });
}

export interface LoadedAdvisorDocument {
  /** An object URL — the caller must `URL.revokeObjectURL` it when done. */
  url: string;
  contentType: string;
}

/**
 * Documents are streamed by the API on an authenticated request (there is no
 * signed link to open), so they are fetched as a Blob and shown from memory.
 */
export async function fetchAdvisorDocument(applicationId: string, docType: AdvisorDocType): Promise<LoadedAdvisorDocument> {
  const response = await backendService.api.get<Blob>(
    `/advisors/application/${encodeURIComponent(applicationId)}/document/${docType}`,
    { responseType: 'blob', timeout: DOCUMENT_TIMEOUT_MS },
  );
  const headerType = response.headers?.['content-type'];
  const contentType = response.data.type || (typeof headerType === 'string' ? headerType.split(';')[0] : '') || 'application/octet-stream';
  return { url: URL.createObjectURL(response.data), contentType };
}
