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

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'secure-uploads';
export const SIGNED_URL_TTL = Number(process.env.SUPABASE_SIGNED_URL_TTL || 600);

export const uploadBuffer = async (filePath: string, buffer: Buffer, contentType: string) => {
  try {
    const client = getStorageClient();
    if (!client) {
      throw new Error('Supabase client not configured');
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
  } catch (err: any) {
    console.warn(`Supabase storage upload failed for ${filePath}: ${err?.message ?? err}. Falling back to local disk storage.`);
    // Local directory fallback.
    //
    // `filePath` is assembled by callers from user-influenced material (uploaded
    // filenames, ids), so it is treated as untrusted here rather than trusting
    // every call site to have sanitised it. path.join() happily resolves `..`
    // segments, so without this check a crafted value would write outside
    // uploads/ — arbitrary file write on the server.
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
      throw new Error('Supabase client not configured');
    }
    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      throw error;
    }

    return data?.signedUrl || null;
  } catch (err: any) {
    console.warn(`Supabase createSignedUrl failed for ${filePath}: ${err?.message ?? err}. Returning local mock URL.`);
    return `http://localhost:3000/uploads/${filePath}`;
  }
};
