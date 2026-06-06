import { Router } from 'express';
import { logger } from '../../config/logger';

const router = Router();

// Whitelist of allowed DiceBear avatar styles
const ALLOWED_STYLES = new Set(['avataaars', 'micah', 'lorelei', 'big-smile', 'bottts']);

/**
 * Basic SVG XSS Sanitizer.
 * Removes <script> blocks, inline on* handlers, and javascript: URIs.
 */
export function sanitizeSvg(svg: string): string {
  if (typeof svg !== 'string') return svg;
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '') // Remove script elements
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '') // Remove onload, onclick, etc.
    .replace(/(?:href|xlink:href)\s*=\s*["']javascript:[^"']*["']/gi, ''); // Remove javascript links
}

/**
 * GET /api/v1/avatars/dicebear/:style/svg
 * Secure proxy endpoint for fetching and sanitizing DiceBear avatars
 */
router.get('/dicebear/:style/svg', async (req, res) => {
  const { style } = req.params;
  const seed = req.query.seed as string;

  if (!ALLOWED_STYLES.has(style)) {
    res.status(400).json({ error: 'Invalid or disallowed avatar style' });
    return;
  }

  if (!seed || typeof seed !== 'string' || seed.length > 100) {
    res.status(400).json({ error: 'Invalid or missing seed query parameter' });
    return;
  }

  // Enforce safe characters in seed to prevent query/path injections
  if (!/^[a-zA-Z0-9\-_ ]+$/.test(seed)) {
    res.status(400).json({ error: 'Seed contains invalid characters' });
    return;
  }

  try {
    const dicebearUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
    
    const response = await fetch(dicebearUrl, {
      signal: AbortSignal.timeout(5000), // 5 seconds timeout
    });

    if (!response.ok) {
      logger.error(`Failed to fetch avatar from Dicebear upstream: ${response.statusText}`, { style, seed });
      res.status(502).json({ error: 'Failed to fetch avatar from upstream provider' });
      return;
    }

    const rawSvg = await response.text();
    const sanitizedSvg = sanitizeSvg(rawSvg);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // Cache for 1 week
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"); // Sandboxed SVG CSP
    res.status(200).send(sanitizedSvg);
  } catch (error) {
    logger.error('Failed to proxy avatar from Dicebear:', { error, style, seed });
    res.status(500).json({ error: 'Internal server error during avatar resolution' });
  }
});

export { router as avatarRoutes };
export default router;
