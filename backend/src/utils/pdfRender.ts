/**
 * Server-side PDF text extraction + page rasterisation.
 *
 * Built on pdf-parse v2 (class API), which bundles pdfjs-dist and
 * @napi-rs/canvas — no system Ghostscript/Poppler needed. Two capabilities:
 *
 *   extractPdfText   — selectable text layer of a digital PDF
 *   renderPdfPagesToPng — real PNG rasters of scanned/flat PDFs, fed to the
 *                         normal image OCR pipeline (Gemini vision / Tesseract)
 *
 * NOTE: pdf-parse v1's `require('pdf-parse')(buffer)` function API no longer
 * exists in v2 — always go through these helpers.
 */
import { PDFParse } from 'pdf-parse';
import { logger } from '../config/logger';

const RENDER_SCALE = Number(process.env.PDF_OCR_RENDER_SCALE || 2.0); // ~144 dpi — good for OCR
const MAX_RENDER_PAGES = 2; // receipt/statement OCR page cap

export interface RenderedPdfPage {
  pageNumber: number;
  png: Buffer;
  width: number;
  height: number;
}

/** Extract the text layer of a PDF. Returns '' for scanned/flat PDFs. */
export const extractPdfText = async (pdfBuffer: Buffer): Promise<string> => {
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  try {
    const result = await parser.getText();
    // v2 appends "-- N of M --" page separators; strip them from parse input
    return (result.text || '').replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim();
  } finally {
    await parser.destroy().catch(() => undefined);
  }
};

/**
 * Render the first `maxPages` pages of a PDF to PNG buffers.
 * Throws when the buffer is not a readable PDF.
 */
export const renderPdfPagesToPng = async (
  pdfBuffer: Buffer,
  maxPages: number = MAX_RENDER_PAGES,
): Promise<RenderedPdfPage[]> => {
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  try {
    const shot = await parser.getScreenshot({
      scale: RENDER_SCALE,
      first: maxPages,
    });
    const pages: RenderedPdfPage[] = (shot.pages || []).slice(0, maxPages).map((p: any) => ({
      pageNumber: p.pageNumber,
      png: Buffer.from(p.data),
      width: p.width,
      height: p.height,
    }));
    if (pages.length === 0) throw new Error('PDF contains no renderable pages');
    logger.info('PDF rasterised for OCR', { pages: pages.length, scale: RENDER_SCALE });
    return pages;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
};

/** Render just the first page — the common receipt case. */
export const renderPdfFirstPageToPng = async (pdfBuffer: Buffer): Promise<Buffer> => {
  const [first] = await renderPdfPagesToPng(pdfBuffer, 1);
  return first.png;
};
