import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as pathLib from 'path';

let _storageClient: any = null;
const getStorageClient = () => {
  if (_storageClient) return _storageClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && key !== 'undefined') {
    try {
      _storageClient = createClient(url, key);
      return _storageClient;
    } catch (err) {
      console.error('Failed to init Supabase storage client:', err);
    }
  }
  return null;
};

// `expense-bills` is the bucket db/supabase/migrations/002_enable_rls.sql creates.
// The old default, `secure-uploads`, never existed in the project, so every
// upload failed: outside production that was masked by the local-disk fallback
// below, and in production uploadBuffer throws.
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'expense-bills';
export const SIGNED_URL_TTL = Number(process.env.SUPABASE_SIGNED_URL_TTL || 600);

/**
 * Outcome of the boot-time bucket probe, kept so /health/deep can report it.
 * `unknown` until the probe resolves.
 */
type StorageProbe = 'unknown' | 'ok' | 'unconfigured' | 'unusable';
let lastProbe: StorageProbe = 'unknown';
let lastProbeDetail: string | undefined;

/**
 * Boot-time probe that the configured bucket exists. Non-fatal on purpose —
 * attachments are secondary to the money paths, so a bad bucket name must not
 * block a deploy — but it must not be silent either: a missing bucket otherwise
 * only surfaces as `downloadUrl: null` long after uploads started failing.
 */
export const verifyStorageBucket = async () => {
  const client = getStorageClient();
  if (!client) {
    lastProbe = 'unconfigured';
    lastProbeDetail = 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set';
    console.warn('[Storage] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — attachments use local disk, and uploads fail in production.');
    return;
  }
  try {
    const { error } = await client.storage.getBucket(STORAGE_BUCKET);
    if (error) {
      lastProbe = 'unusable';
      lastProbeDetail = error.message;
      console.error(`[Storage] Bucket "${STORAGE_BUCKET}" is unusable (${error.message}) — every attachment upload will fail. Check SUPABASE_STORAGE_BUCKET.`);
    } else {
      lastProbe = 'ok';
      lastProbeDetail = undefined;
      console.log(`[Storage] Verified cloud storage bucket "${STORAGE_BUCKET}" successfully.`);
    }
  } catch (err: any) {
    lastProbe = 'unusable';
    lastProbeDetail = err?.message ?? String(err);
    console.error(`[Storage] Could not verify bucket "${STORAGE_BUCKET}": ${err?.message ?? err}`);
  }
};

/**
 * Whether uploads can actually work, for /health/deep.
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are dashboard-only secrets
 * (`sync: false` in render.yaml), so they are easy to have in .env and missing
 * on the deployed service. When they are, every upload path — advisor
 * documents, bills, vault files — fails with a 5xx that looks like an
 * application bug, and the only evidence is a boot-log line nobody re-reads.
 *
 * Reports the boot probe's verdict, not merely whether a client could be
 * constructed: a wrong service-role key or a renamed bucket builds a client
 * happily and still fails every upload.
 */
export const getStorageHealth = () => ({
  configured: Boolean(getStorageClient()),
  bucket: STORAGE_BUCKET,
  probe: lastProbe,
  ...(lastProbeDetail ? { detail: lastProbeDetail } : {}),
});

export const uploadBuffer = async (filePath: string, buffer: Buffer, contentType: string) => {
  try {
    const client = getStorageClient();
    if (!client) {
      throw new Error('Supabase client not configured (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing)');
    }
    const { error } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, {
        contentType,
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      throw error;
    }
    return;
  } catch (err: any) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`[Storage] Production cloud storage upload failed for ${filePath}:`, err?.message ?? err);
      throw new Error(`Persistent cloud storage unavailable: ${err?.message ?? 'Upload failed'}`);
    }
    console.warn(`[Storage] Supabase storage upload failed for ${filePath}: ${err?.message ?? err}. Falling back to local disk storage.`);
    // Local directory fallback.
    const localDir = pathLib.join(process.cwd(), 'uploads');
    const fullPath = pathLib.resolve(localDir, filePath);
    const containment = localDir.endsWith(pathLib.sep) ? localDir : localDir + pathLib.sep;

    if (!fullPath.startsWith(containment)) {
      throw new Error(`Refusing to write outside the uploads directory: ${filePath}`);
    }

    fs.mkdirSync(pathLib.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);
  }
};

export const removeObject = async (filePath: string) => {
  try {
    const client = getStorageClient();
    if (!client) {
      throw new Error('Supabase client not configured');
    }
    const { error } = await client.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);

    if (error) {
      throw error;
    }
  } catch (err: any) {
    console.warn(`Supabase storage remove failed for ${filePath}: ${err?.message ?? err}. Attempting local remove.`);
    const localDir = pathLib.join(process.cwd(), 'uploads');
    const fullPath = pathLib.join(localDir, filePath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // ignore
      }
    }
  }
};

export const createSignedUrl = async (filePath: string, expiresIn = SIGNED_URL_TTL) => {
  try {
    const client = getStorageClient();
    if (!client) {
      throw new Error('Supabase client not configured (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing)');
    }
    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      throw error;
    }

    return data?.signedUrl || null;
  } catch (err: any) {
    // Callers treat null as "no URL" and fall back to streaming, so this is the
    // only place the storage error is visible.
    console.warn(`[Storage] Supabase signed URL failed for ${filePath}: ${err?.message ?? err}`);
    return null;
  }
};

export const getLocalFilePath = (filePath: string): string | null => {
  try {
    const localDir = pathLib.join(process.cwd(), 'uploads');
    const fullPath = pathLib.resolve(localDir, filePath);
    const containment = localDir.endsWith(pathLib.sep) ? localDir : localDir + pathLib.sep;
    if (fullPath.startsWith(containment) && fs.existsSync(fullPath)) {
      return fullPath;
    }
  } catch {
    // ignore
  }
  return null;
};

export const downloadBuffer = async (
  filePath: string,
): Promise<{ buffer: Buffer; contentType?: string } | null> => {
  // 1. Try Supabase storage if client configured
  try {
    const client = getStorageClient();
    if (client) {
      const { data, error } = await client.storage.from(STORAGE_BUCKET).download(filePath);
      if (error) {
        console.warn(`[Storage] Supabase download error for ${filePath}: ${error.message}`);
      } else if (data) {
        const arrayBuffer = await data.arrayBuffer();
        return { buffer: Buffer.from(arrayBuffer), contentType: data.type };
      }
    } else {
      console.warn(`[Storage] getStorageClient returned null while downloading ${filePath} — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY`);
    }
  } catch (err: any) {
    console.warn(`[Storage] Exception downloading ${filePath} from Supabase:`, err?.message ?? err);
  }

  // 2. Try local disk fallback
  try {
    const localPath = getLocalFilePath(filePath);
    if (localPath) {
      const buffer = fs.readFileSync(localPath);
      return { buffer };
    }
  } catch {
    // ignore
  }

  return null;
};

