import { TokenManager } from '@/lib/api';
import type { OCRProgress, ReceiptCharge, ReceiptLineItem, ReceiptScanResult, TaxComponent, TotalValidationResult } from '@/types/receipt.types';
import { getConfiguredApiBase } from '@/lib/apiBase';
import { awaitPinUnlock, getPinUnlockToken, setPinUnlockToken } from '@/lib/pinUnlockCoordinator';

const API_BASE = (getConfiguredApiBase()).replace(/\/+$/, '');

export type CloudScanErrorCode =
  | 'PIN_LOCKED'
  | 'FEATURE_DISABLED'
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED'
  | 'UNSUPPORTED'
  | 'SCAN_FAILED'
  | 'TIMEOUT';

/** A cloud-scan failure the UI can explain to the user instead of hiding. */
export class CloudScanError extends Error {
  constructor(public readonly code: CloudScanErrorCode, message: string) {
    super(message);
    this.name = 'CloudScanError';
  }
}

/**
 * Upload sizing. A bill is text on paper: 1600px on the long edge keeps small
 * print legible to the model while cutting a 12MP phone photo to a few hundred
 * KB. The previous 1920px/0.86 combination produced uploads large enough that
 * slow connections spent most of the scan budget on the POST alone.
 */
const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.82;
/** Below this, the image is already small enough that re-encoding only costs quality. */
const RECOMPRESS_THRESHOLD_BYTES = 400 * 1024;

/**
 * Total time the client will wait for a reading, comfortably above the server's
 * own job budget so that a genuine server-side failure surfaces as its real
 * reason rather than as a client timeout.
 */
const SCAN_BUDGET_MS = 150_000;

/**
 * Poll pacing. Early polls are cheap and catch fast scans quickly; later ones
 * back off so a slow bill does not generate 75 requests. The old fixed 2s/30
 * attempts capped the wait at 60s — under the time a vision pass on a large
 * bill legitimately takes, which is exactly why users saw "OCR extraction
 * timed out" on bills that were about to succeed.
 */
const pollDelayMs = (elapsedMs: number): number => {
  if (elapsedMs < 6_000) return 700;
  if (elapsedMs < 20_000) return 1_500;
  if (elapsedMs < 60_000) return 2_500;
  return 4_000;
};

/**
 * What the user is told while waiting. Deliberately about their receipt, not
 * about our pipeline: "falling back to on-device OCR" is an implementation
 * detail that reads as a malfunction.
 */
const progressMessage = (elapsedMs: number): string => {
  if (elapsedMs < 8_000) return "We're analyzing your receipt. This may take a few seconds.";
  if (elapsedMs < 25_000) return 'Reading the line items and totals…';
  if (elapsedMs < 60_000) return 'Checking the tax breakdown and totals…';
  return 'Still working on this one — detailed bills take a little longer.';
};

/** Progress bar position from elapsed time, easing toward but never reaching 95%. */
const progressPercent = (elapsedMs: number): number =>
  Math.min(95, 40 + Math.round(55 * (1 - Math.exp(-elapsedMs / 30_000))));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetries = async (
  url: string,
  options: RequestInit = {},
  retries = 2,
  backoff = 500,
): Promise<Response> => {
  try {
    const response = await fetch(url, options);
    if (response.ok) {
      return response;
    }

    if (retries > 0 && response.status >= 500) {
      await sleep(backoff);
      return fetchWithRetries(url, options, retries - 1, Math.min(backoff * 2, 5000));
    }

    return response;
  } catch (error) {
    if (retries > 0) {
      await sleep(backoff);
      return fetchWithRetries(url, options, retries - 1, Math.min(backoff * 2, 5000));
    }
    throw error;
  }
};

const getAuthToken = async () => {
  // Backend-managed auth: the API credential is the backend JWT in TokenManager.
  const token = TokenManager.getAccessToken();
  if (!token) {
    console.warn('[ReceiptScanner] No auth token found');
  }
  return token || null;
};

const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => {
  const fr = new FileReader();
  fr.onerror = () => rej(new Error('Failed to read receipt file'));
  fr.onload = () => res(String(fr.result));
  fr.readAsDataURL(f);
});

/**
 * Was `new Promise(async (resolve, reject) => …)`. An async executor is a trap:
 * anything that throws before the hand-written try/catch is installed rejects a
 * promise nobody holds, so the outer promise hangs forever instead of failing.
 * Only the final image load genuinely needs the executor wrapper.
 */
const loadImage = async (file: File): Promise<HTMLImageElement> => {
  let dataUrl: string;
  try {
    dataUrl = await readAsDataUrl(file);
  } catch {
    // One retry: FileReader intermittently fails on a freshly-captured photo
    // that the camera app has not finished flushing to disk.
    await new Promise((r) => setTimeout(r, 150));
    dataUrl = await readAsDataUrl(file);
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load receipt image'));
    image.src = dataUrl;
  });
};

const compressImageForUpload = async (file: File) => {
  // An already-small image is left alone: re-encoding a 200KB photo only
  // discards detail the model could have used on faint thermal print.
  if (file.size <= RECOMPRESS_THRESHOLD_BYTES && file.type === 'image/jpeg') {
    return file;
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(image.width, image.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is unavailable for image compression');
  }

  // High-quality downscale: the browser default is a box filter that turns
  // small print into mush at these ratios.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error('Failed to compress receipt image'));
        return;
      }
      resolve(nextBlob);
    }, 'image/jpeg', JPEG_QUALITY);
  });

  return blob;
};

const parseScanDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
};

const parseTaxBreakdown = (raw: unknown): TaxComponent[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const components = raw
    .filter((t): t is Record<string, unknown> => t !== null && typeof t === 'object')
    .map((t) => ({
      name: typeof t.name === 'string' ? t.name : 'Tax',
      rate: typeof t.rate === 'number' ? t.rate : undefined,
      amount: typeof t.amount === 'number' ? t.amount : 0,
    }))
    .filter((t) => t.amount > 0);
  return components.length > 0 ? components : undefined;
};

const parseItems = (raw: unknown): ReceiptLineItem[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .filter((i): i is Record<string, unknown> => i !== null && typeof i === 'object')
    .map((i) => ({
      name: typeof i.name === 'string' ? i.name : 'Item',
      quantity: typeof i.quantity === 'number' ? i.quantity : undefined,
      rate: typeof i.rate === 'number' ? i.rate : undefined,
      amount: typeof i.amount === 'number' ? i.amount : 0,
    }))
    .filter((i) => i.name && i.amount > 0);
  return items.length > 0 ? items : undefined;
};

const parseCharges = (raw: unknown): ReceiptCharge[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const charges = raw
    .filter((c): c is Record<string, unknown> => c !== null && typeof c === 'object')
    .map((c) => ({
      type: typeof c.type === 'string' ? c.type : 'OTHER',
      label: typeof c.label === 'string' ? c.label : 'Other charge',
      amount: typeof c.amount === 'number' ? c.amount : 0,
      rate: typeof c.rate === 'number' ? c.rate : undefined,
    }))
    .filter((c) => c.amount !== 0);
  return charges.length > 0 ? charges : undefined;
};

/**
 * Turn an engine-level failure into something a user can act on. The raw
 * message names models and pipeline stages — accurate for the log, meaningless
 * (and alarming) in a toast.
 */
const friendlyFailure = (error: unknown): string => {
  const message = typeof error === 'string' ? error : '';
  if (/too long|timeout|exceeded/i.test(message)) {
    return 'This receipt took too long to read. Please try again, or enter the amount manually.';
  }
  if (/unsupported file|not an image|file type/i.test(message)) {
    return 'That file type is not supported. Use a photo or PDF of the bill.';
  }
  if (/could not read|no text/i.test(message)) {
    return 'We could not read this image. Try a sharper, well-lit photo of the whole bill.';
  }
  return 'We could not read this receipt. Please try again, or enter the amount manually.';
};

const parseValidationResult = (raw: unknown): TotalValidationResult | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = raw as Record<string, unknown>;
  if (typeof v.isValid !== 'boolean') return undefined;
  return {
    isValid: v.isValid,
    calculated: typeof v.calculated === 'number' ? v.calculated : 0,
    detected: typeof v.detected === 'number' ? v.detected : 0,
  };
};

export class CloudReceiptScanService {
  async scanReceipt(
    file: File,
    onProgress?: (progress: OCRProgress) => void,
    preferredCurrency: string = 'INR',
  ): Promise<ReceiptScanResult> {
    const isPdf = file.type === 'application/pdf';
    if (!file.type.startsWith('image/') && !isPdf) {
      throw new CloudScanError('UNSUPPORTED', 'That file type is not supported. Use a photo or PDF of the bill.');
    }

    onProgress?.({ status: 'Preparing your receipt…', progress: 10 });
    // The backend reads a PDF's text layer directly (or rasterises a scanned
    // one), so it goes up untouched; only photos are downscaled.
    const payload: Blob = isPdf ? file : await compressImageForUpload(file);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'receipt';

    const formData = new FormData();
    formData.append('file', payload, `${baseName}.${isPdf ? 'pdf' : 'jpg'}`);
    formData.append('currency', preferredCurrency || 'INR');

    const token = await getAuthToken();
    const buildHeaders = (): Record<string, string> => {
      const next: Record<string, string> = {};
      if (token) next.Authorization = `Bearer ${token}`;
      const pinUnlock = getPinUnlockToken();
      if (pinUnlock) next['X-Pin-Unlock'] = pinUnlock;
      return next;
    };
    let headers = buildHeaders();

    const startUrl = `${API_BASE}/receipts/start`;
    onProgress?.({ status: "We're analyzing your receipt. This may take a few seconds.", progress: 30 });

    let startResponse = await fetchWithRetries(startUrl, { method: 'POST', headers, body: formData });

    // The receipts API sits behind the server-side PIN gate. Right after an
    // unlock the server can still answer 403 while /pin/verify is in flight —
    // wait for it and retry once. A 403 with no verify pending is a real lock,
    // which used to be swallowed here and silently downgraded every scan to
    // the on-device reader.
    if (startResponse.status === 403) {
      const body = await startResponse.clone().json().catch(() => ({} as Record<string, unknown>));
      if (body?.code === 'PIN_VERIFICATION_REQUIRED') {
        if (await awaitPinUnlock()) {
          headers = buildHeaders();
          startResponse = await fetchWithRetries(startUrl, { method: 'POST', headers, body: formData });
        }
        if (startResponse.status === 403) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('KANAKU_FORCE_PIN_LOCK'));
          }
          throw new CloudScanError('PIN_LOCKED', 'Unlock Kanaku with your PIN to use AI receipt reading.');
        }
      } else {
        throw new CloudScanError(
          'FEATURE_DISABLED',
          typeof body?.error === 'string' ? body.error : 'AI receipt reading is turned off for your account.',
        );
      }
    }

    const startPinUnlock = startResponse.headers?.get?.('X-Pin-Unlock');
    if (startPinUnlock) {
      setPinUnlockToken(startPinUnlock);
      headers['X-Pin-Unlock'] = startPinUnlock;
    }

    if (startResponse.status === 401) {
      throw new CloudScanError('UNAUTHENTICATED', 'Please sign in again to use AI receipt reading.');
    }
    if (startResponse.status === 429) {
      const body = await startResponse.json().catch(() => ({} as Record<string, unknown>));
      throw new CloudScanError(
        'RATE_LIMITED',
        typeof body?.error === 'string' ? body.error : 'Too many scans right now — wait a minute and try again.',
      );
    }
    if (!startResponse.ok) {
      const errorBody = await startResponse.json().catch(() => ({} as Record<string, unknown>));
      throw new CloudScanError(
        'SCAN_FAILED',
        typeof errorBody?.error === 'string' ? errorBody.error : 'We could not start reading this receipt. Please try again.',
      );
    }

    const { job_id } = await startResponse.json();

    // Poll until the job resolves or the budget runs out. Paced by elapsed
    // wall-clock time rather than an attempt counter, so slow networks and slow
    // bills are both handled by waiting rather than by giving up early.
    const statusUrl = `${API_BASE}/receipts/status/${job_id}`;
    const startedAt = Date.now();
    let consecutiveStatusErrors = 0;

    while (Date.now() - startedAt < SCAN_BUDGET_MS) {
      const elapsed = Date.now() - startedAt;
      onProgress?.({ status: progressMessage(elapsed), progress: progressPercent(elapsed) });

      const statusResponse = await fetchWithRetries(statusUrl, { headers });
      const statusPinUnlock = statusResponse.headers?.get?.('X-Pin-Unlock');
      if (statusPinUnlock) {
        setPinUnlockToken(statusPinUnlock);
        headers['X-Pin-Unlock'] = statusPinUnlock;
      }
      if (!statusResponse.ok) {
        // A transient blip while the job is still running is not a failure —
        // only give up if the status endpoint keeps failing.
        consecutiveStatusErrors += 1;
        if (consecutiveStatusErrors >= 4 || statusResponse.status === 404) {
          throw new CloudScanError('SCAN_FAILED', 'We lost track of this scan. Please try again.');
        }
        await sleep(pollDelayMs(elapsed));
        continue;
      }
      consecutiveStatusErrors = 0;

      const job = await statusResponse.json();
      if (job.status === 'completed') {
        const payload = job.data;
        onProgress?.({ status: 'Almost done…', progress: 96 });

        const merchantName = typeof payload.merchantName === 'string' ? payload.merchantName : undefined;
        const amount = typeof payload.amount === 'number' && Number.isFinite(payload.amount) ? payload.amount : undefined;
        const date = parseScanDate(payload.date);
        const location = typeof payload.location === 'string' ? payload.location : 'UNKNOWN';
        let currency = typeof payload.currency === 'string' ? payload.currency : (preferredCurrency || 'INR');
        if (
          currency === 'USD' &&
          (preferredCurrency === 'INR' || location === 'INDIA' || Boolean(payload.gstin))
        ) {
          currency = 'INR';
        }

        // A missing score means the backend could not vouch for the reading, so
        // it is treated as unreliable. Defaulting to 0.85 here painted every
        // such scan as a "High confidence scan" — including ones the extractor
        // had already scored as guesswork.
        const confidence = typeof payload.confidence === 'number' && Number.isFinite(payload.confidence)
          ? payload.confidence
          : 0.4;

        const taxBreakdown = parseTaxBreakdown(payload.taxBreakdown);
        const items = parseItems(payload.items);
        const validationResult = parseValidationResult(payload.validationResult);
        const taxAmount = typeof payload.taxAmount === 'number'
          ? payload.taxAmount
          : taxBreakdown?.reduce((sum, item) => sum + item.amount, 0);

        const aiDescription = typeof payload.description === 'string' ? payload.description : undefined;
        const itemsDescription = items && items.length > 0
          ? items.slice(0, 3).map((i) => `${i.name} ${currency} ${i.amount}`).join(', ')
          : undefined;

        onProgress?.({ status: 'Intelligence engine complete', progress: 100 });

        return {
          merchantName,
          amount,
          currency,
          date,
          location,
          time: typeof payload.time === 'string' ? payload.time : undefined,
          subtotal: typeof payload.subtotal === 'number' ? payload.subtotal : undefined,
          taxAmount: typeof taxAmount === 'number' && Number.isFinite(taxAmount) ? Number(taxAmount.toFixed(2)) : undefined,
          taxBreakdown: taxBreakdown && taxBreakdown.length > 0
            ? taxBreakdown
            : (typeof taxAmount === 'number' && taxAmount > 0 ? [{ name: 'Tax', amount: Number(taxAmount.toFixed(2)) }] : undefined),
          invoiceNumber: typeof payload.invoiceNumber === 'string' ? payload.invoiceNumber : undefined,
          paymentMethod: typeof payload.paymentMethod === 'string' ? payload.paymentMethod : undefined,
          category: typeof payload.category === 'string' ? payload.category : undefined,
          subcategory: typeof payload.subcategory === 'string' && payload.subcategory.trim() ? payload.subcategory.trim() : undefined,
          description: aiDescription ?? itemsDescription,
          items,
          validationResult,
          confidence: Math.max(0, Math.min(1, confidence)),
          rawText: JSON.stringify(payload || {}),
          notes: typeof payload.category === 'string' ? `${payload.category.toLowerCase()} receipt` : 'cloud ocr receipt',

          // Structured extraction: charges, tax model and the reconciliation
          // report, carried through so the review card can show what the
          // engine actually concluded rather than re-deriving it.
          discountAmount: typeof payload.discount === 'number' ? payload.discount : undefined,
          discountPercent: typeof payload.discountPercent === 'number' ? payload.discountPercent : undefined,
          additionalCharges: parseCharges(payload.additionalCharges),
          totalCharges: typeof payload.totalCharges === 'number' ? payload.totalCharges : undefined,
          roundOff: typeof payload.roundOff === 'number' ? payload.roundOff : undefined,
          taxModel: payload.taxModel === 'inclusive' || payload.taxModel === 'exclusive' ? payload.taxModel : undefined,
          merchantAddress: typeof payload.merchant?.address === 'string' ? payload.merchant.address : undefined,
          merchantBrand: typeof payload.merchant?.brand === 'string' ? payload.merchant.brand : undefined,
          gstin: typeof payload.gstin === 'string' ? payload.gstin : undefined,
          billNumber: typeof payload.billNumber === 'string' ? payload.billNumber : undefined,
          reviewIssues: Array.isArray(payload.validation?.issues) ? payload.validation.issues : undefined,
          requiresReview: Boolean(payload.validation?.requiresReview),
          engine: typeof payload.engine === 'string' ? payload.engine : undefined,
          billId: typeof payload.billId === 'string' ? payload.billId : undefined,
          downloadUrl: typeof payload.downloadUrl === 'string' ? payload.downloadUrl : undefined,
          // Absent on an older server build. Falling back to "did we get an id"
          // keeps the meaning right rather than defaulting to `true` and
          // claiming a bill was stored when nothing said so.
          billStored: typeof payload.billStored === 'boolean'
            ? payload.billStored
            : typeof payload.billId === 'string',
          warnings: Array.isArray(payload.warnings)
            ? payload.warnings.filter((w: unknown): w is string => typeof w === 'string')
            : [],
        };
      }

      if (job.status === 'failed') {
        // The server's message names the real cause; anything internal-sounding
        // is replaced rather than shown to the user.
        throw new CloudScanError('SCAN_FAILED', friendlyFailure(job.error));
      }

      await sleep(pollDelayMs(Date.now() - startedAt));
    }

    throw new CloudScanError(
      'TIMEOUT',
      "This receipt is taking longer than expected to read. Check your connection and try again, "
      + 'or enter the amount manually.',
    );
  }
}

export const cloudReceiptScanService = new CloudReceiptScanService();
