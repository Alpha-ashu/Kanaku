import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/backend-api', () => ({ backendService: { api: { post, get } } }));

import {
  ADVISOR_DOCUMENT_MAX_BYTES,
  checkAdvisorDocument,
  describeApiFailure,
  fetchAdvisorDocument,
  submitAdvisorApplication,
} from '@/services/advisorApplicationService';

const fileOf = (name: string, type: string, size = 1024) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

/** What backendService's interceptor rejects with: its own Error, the axios error on `.original`. */
const wrapped = (status: number | null, data?: unknown, code?: string) => {
  const config = { headers: new AxiosHeaders() };
  const response = status === null ? undefined : { data, status, statusText: '', headers: {}, config };
  const original = new AxiosError('Request failed', code ?? (status === null ? 'ECONNABORTED' : 'ERR_BAD_RESPONSE'), config, {}, response);
  return Object.assign(new Error('Something went wrong. Please try again later.'), { status, original });
};

describe('advisor application service', () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
  });

  describe('checkAdvisorDocument', () => {
    it('accepts the untyped files the Android picker hands the WebView', () => {
      expect(checkAdvisorDocument(fileOf('document', ''), 'PAN Card')).toBeNull();
      expect(checkAdvisorDocument(fileOf('IMG_2031', 'application/octet-stream'), 'PAN Card')).toBeNull();
      expect(checkAdvisorDocument(fileOf('pan.PDF', 'application/pdf'), 'PAN Card')).toBeNull();
      expect(checkAdvisorDocument(fileOf('aadhaar.jpeg', 'image/jpeg'), 'Aadhaar Card')).toBeNull();
    });

    it('refuses a file that is plainly unusable before a long upload', () => {
      expect(checkAdvisorDocument(fileOf('scan.heic', 'image/heic'), 'PAN Card')).toMatch(/PDF, JPG, PNG or WEBP/);
      expect(checkAdvisorDocument(fileOf('cv.docx', ''), 'Professional certificate')).toMatch(/PDF, JPG, PNG or WEBP/);
      expect(checkAdvisorDocument(fileOf('pan.pdf', 'application/pdf', ADVISOR_DOCUMENT_MAX_BYTES + 1), 'PAN Card')).toMatch(/10 MB/);
      expect(checkAdvisorDocument(fileOf('pan.pdf', 'application/pdf', 0), 'PAN Card')).toMatch(/empty/);
    });
  });

  describe('describeApiFailure', () => {
    it("surfaces the server's own message, not the interceptor's generic one", async () => {
      const failure = await describeApiFailure(
        wrapped(400, { error: 'You already have a pending application', code: 'APPLICATION_PENDING' }),
        'Submission failed',
      );
      expect(failure).toMatchObject({ message: 'You already have a pending application', code: 'APPLICATION_PENDING', status: 400, noResponse: false });
    });

    it('keeps the request id of a server error so the user can report it', async () => {
      const failure = await describeApiFailure(
        wrapped(503, { error: 'Document storage is unavailable right now.', code: 'STORAGE_UNAVAILABLE', requestId: 'req-1234567890' }),
        'Submission failed',
      );
      expect(failure.status).toBe(503);
      expect(failure.requestId).toBe('req-1234567890');
      expect(failure.message).toMatch(/storage is unavailable/);
    });

    it('marks a timeout as "no response" so the caller can check what the server recorded', async () => {
      const failure = await describeApiFailure(wrapped(null), 'Submission failed');
      expect(failure.noResponse).toBe(true);
      expect(failure.message).toMatch(/did not finish in time/);
    });

    it('reads the JSON error out of a Blob body (document downloads)', async () => {
      const body = new Blob([JSON.stringify({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' })], { type: 'application/json' });
      const failure = await describeApiFailure(wrapped(404, body), 'Could not load the document');
      expect(failure).toMatchObject({ message: 'Document not found', code: 'DOCUMENT_NOT_FOUND', status: 404 });
    });

    it('falls back when the server sent no message', async () => {
      expect((await describeApiFailure(wrapped(500, 'gateway error html'), 'Submission failed')).message).toBe('Submission failed');
    });
  });

  it('submits with a long timeout and reports upload progress', async () => {
    post.mockImplementation(async (_url: string, _body: FormData, config: { onUploadProgress: (e: { loaded: number; total?: number }) => void }) => {
      config.onUploadProgress({ loaded: 50, total: 200 });
      config.onUploadProgress({ loaded: 200, total: 200 });
      return { data: { success: true } };
    });
    const progress: number[] = [];
    await submitAdvisorApplication(new FormData(), (p) => progress.push(p));

    expect(post).toHaveBeenCalledWith('/advisors/apply', expect.any(FormData), expect.objectContaining({ timeout: 150_000 }));
    expect(progress).toEqual([25, 100]);
  });

  it('loads a document as an in-memory object URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL }));
    get.mockResolvedValue({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), headers: {} });

    const loaded = await fetchAdvisorDocument('app-1', 'pan');

    expect(get).toHaveBeenCalledWith('/advisors/application/app-1/document/pan', expect.objectContaining({ responseType: 'blob' }));
    expect(loaded).toEqual({ url: 'blob:mock-url', contentType: 'application/pdf' });
    vi.unstubAllGlobals();
  });
});
