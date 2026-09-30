import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { MAX_UPLOAD_BYTES } from '../utils/uploadPolicy';

type UploadLimits = NonNullable<multer.Options['limits']>;

const handleUploadError = (err: any, res: Response, maxBytes: number, next: NextFunction) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: `File exceeds ${Math.round(maxBytes / (1024 * 1024))}MB limit`, code: 'UPLOAD_TOO_LARGE' });
  }
  return res.status(400).json({ error: err.message || 'Upload failed' });
};

export const uploadSingle = (
  fieldName: string,
  options?: { maxBytes?: number },
) =>
  (req: Request, res: Response, next: NextFunction) => {
    const maxBytes = options?.maxBytes ?? MAX_UPLOAD_BYTES;
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes } });
    upload.single(fieldName)(req, res, (err: any) => handleUploadError(err, res, maxBytes, next));
  };

/**
 * `limits` tightens multer's defaults for one route — multer otherwise accepts
 * any number of text fields of up to 1 MB each, all buffered in memory.
 */
export const uploadFields = (
  fields: { name: string; maxCount?: number }[],
  options?: { maxBytes?: number; limits?: Omit<UploadLimits, 'fileSize'> },
) =>
  (req: Request, res: Response, next: NextFunction) => {
    const maxBytes = options?.maxBytes ?? MAX_UPLOAD_BYTES;
    const upload = multer({ storage: multer.memoryStorage(), limits: { ...options?.limits, fileSize: maxBytes } });
    upload.fields(fields)(req, res, (err: any) => handleUploadError(err, res, maxBytes, next));
  };
