import { TokenManager } from '@/lib/api';
import supabase from '@/utils/supabase/client';
import type { OCRProgress, ReceiptLineItem, ReceiptScanResult, TaxComponent, TotalValidationResult } from '@/types/receipt.types';

const API_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');
const MAX_LONG_EDGE = 1920;
const JPEG_QUALITY = 0.86;

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
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  
  // Fallback to custom JWT stored in localStorage
  const token = TokenManager.getAccessToken();
                
  if (!token) {
    console.warn('[ReceiptScanner] No auth token found in localStorage');
  }
  return token || null;
};

const loadImage = (file: File) => new Promise<HTMLImageElement>(async (resolve, reject) => {
  const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('Failed to read receipt file'));
    fr.onload = () => res(String(fr.result));
    fr.readAsDataURL(f);
  });

  try {
    let dataUrl: string;
    try {
      dataUrl = await readAsDataUrl(file);
    } catch (err) {
      await new Promise((r) => setTimeout(r, 150));
      dataUrl = await readAsDataUrl(file);
    }

    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load receipt image'));
    image.src = dataUrl;
  } catch (err) {
    reject(err);
  }
});

const compressImageForUpload = async (file: File) => {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(image.width, image.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is unavailable for image compression');
  }

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
  ): Promise<ReceiptScanResult> {
    if (!file.type.startsWith('image/')) {
      throw new Error('Cloud receipt scan currently supports image files only');
    }

    onProgress?.({ status: 'Compressing image for upload...', progress: 15 });
    const compressedBlob = await compressImageForUpload(file);

    const formData = new FormData();
    formData.append('file', compressedBlob, `${file.name.replace(/\.[^.]+$/, '') || 'receipt'}.jpg`);

    const token = await getAuthToken();
    const headers: HeadersInit = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const startUrl = `${API_BASE}/receipts/start`;
    onProgress?.({ status: 'Uploading and starting AI extraction job...', progress: 35 });
    
    const startResponse = await fetchWithRetries(startUrl, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!startResponse.ok) {
      const errorBody = await startResponse.json().catch(() => ({}));
      throw new Error(errorBody.error || 'Failed to start OCR job');
    }

    const { job_id } = await startResponse.json();
    
    // Polling for completion
    let attempts = 0;
    const maxAttempts = 30; // 30 * 2s = 60s max
    const statusUrl = `${API_BASE}/receipts/status/${job_id}`;

    while (attempts < maxAttempts) {
      onProgress?.({ status: `AI extracting details (Attempt ${attempts + 1})...`, progress: 40 + (attempts * 2) });
      
      const statusResponse = await fetchWithRetries(statusUrl, { headers });
      if (!statusResponse.ok) {
        if (statusResponse.status >= 500 && attempts < maxAttempts - 1) {
          await sleep(2000);
          attempts += 1;
          continue;
        }
        throw new Error('Failed to check OCR status');
      }
      
      const job = await statusResponse.json();
      if (job.status === 'completed') {
        const payload = job.data;
        onProgress?.({ status: 'Applying global intelligence & tax extraction...', progress: 95 });

        const merchantName = typeof payload.merchantName === 'string' ? payload.merchantName : undefined;
        const amount = typeof payload.amount === 'number' && Number.isFinite(payload.amount) ? payload.amount : undefined;
        const currency = typeof payload.currency === 'string' ? payload.currency : 'INR';
        const date = parseScanDate(payload.date);
        const location = typeof payload.location === 'string' ? payload.location : 'UNKNOWN';

        const confidence = typeof payload.confidence === 'number' && Number.isFinite(payload.confidence)
          ? payload.confidence
          : 0.85;

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
        };
      }
      
      if (job.status === 'failed') {
        throw new Error(job.error || 'AI extraction failed');
      }

      attempts++;
      await new Promise(r => setTimeout(r, 2000));
    }

    throw new Error('OCR extraction timed out. Please try again.');
  }
}

export const cloudReceiptScanService = new CloudReceiptScanService();
