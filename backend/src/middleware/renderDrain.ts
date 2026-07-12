/**
 * Render HTTP log-drain → Grafana Cloud Loki forwarder.
 *
 * Render can POST every log line to an HTTP endpoint (dashboard → Service →
 * Logs → Log Drains → Add Log Drain → HTTP). This handler:
 *
 *   1. Validates the `Authorization: Bearer <RENDER_DRAIN_TOKEN>` secret so
 *      only Render can push logs in.
 *   2. Parses Render's NDJSON body (one JSON object per line, or a single JSON
 *      array — Render sends batches).
 *   3. Structures and forwards the batch to Grafana Cloud Loki using the Loki
 *      push API (`POST /loki/api/v1/push`).
 *
 * If `LOKI_PUSH_URL` / `LOKI_USERNAME` / `LOKI_API_KEY` are not set the
 * handler returns 200 immediately (graceful no-op) — so a deploy without Loki
 * credentials configured never errors, and logs simply stay in Render's UI.
 *
 * Loki push format reference:
 *   https://grafana.com/docs/loki/latest/reference/loki-http-api/#push-log-entries-to-loki
 */
import { Request, Response } from 'express';
import https from 'https';
import { URL } from 'url';
import { logger } from '../config/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

/** One log entry as Render delivers it. */
interface RenderLogEntry {
  timestamp?: string;
  message?: string;
  msg?: string;
  level?: string;
  host?: string;
  service?: string;
  [key: string]: unknown;
}

/** Grafana Loki push payload. */
interface LokiPushPayload {
  streams: Array<{
    stream: Record<string, string>;
    values: Array<[string, string]>; // [unix_nano_string, log_line]
  }>;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const getLokiConfig = () => ({
  url: process.env.LOKI_PUSH_URL ?? '',
  username: process.env.LOKI_USERNAME ?? '',
  apiKey: process.env.LOKI_API_KEY ?? '',
  drainToken: process.env.RENDER_DRAIN_TOKEN ?? '',
  app: process.env.RENDER_SERVICE_NAME ?? 'kanaku',
  env: process.env.NODE_ENV ?? 'production',
});

const isLokiConfigured = (): boolean => {
  const { url, username, apiKey } = getLokiConfig();
  return url.length > 0 && username.length > 0 && apiKey.length > 0;
};

// ── Loki push ─────────────────────────────────────────────────────────────────

/**
 * Send a batch of log entries to Grafana Cloud Loki.
 * Fire-and-forget: we don't await this in the HTTP handler so Render's drain
 * request returns immediately and never times out.
 */
const pushToLoki = (entries: RenderLogEntry[]): void => {
  if (!isLokiConfigured() || entries.length === 0) return;

  const cfg = getLokiConfig();

  // Group all entries into a single Loki stream (same labels for the batch).
  const values: Array<[string, string]> = entries.map((entry) => {
    const ts = entry.timestamp
      ? (new Date(entry.timestamp).getTime() * 1_000_000).toString()
      : (Date.now() * 1_000_000).toString();
    const line = typeof entry.message === 'string'
      ? entry.message
      : (entry.msg ?? JSON.stringify(entry));
    return [ts, line];
  });

  const payload: LokiPushPayload = {
    streams: [
      {
        stream: {
          app: cfg.app,
          env: cfg.env,
          source: 'render-log-drain',
        },
        values,
      },
    ],
  };

  const body = JSON.stringify(payload);
  const lokiUrl = new URL('/loki/api/v1/push', cfg.url);
  const auth = Buffer.from(`${cfg.username}:${cfg.apiKey}`).toString('base64');

  const req = https.request(
    {
      hostname: lokiUrl.hostname,
      port: lokiUrl.port || 443,
      path: lokiUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Basic ${auth}`,
      },
    },
    (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        logger.warn('[log-drain] Loki push failed', { status: res.statusCode });
      }
      // Drain response so the socket is released.
      res.resume();
    },
  );
  req.on('error', (err) => {
    logger.warn('[log-drain] Loki push error', { error: err.message });
  });
  req.write(body);
  req.end();
};

// ── Request parser ─────────────────────────────────────────────────────────────

/**
 * Parse Render's log-drain body. Render sends either:
 *   - NDJSON: one JSON object per line (newline-delimited), or
 *   - A single JSON array of log objects.
 */
const parseBody = (raw: unknown): RenderLogEntry[] => {
  if (Array.isArray(raw)) return raw as RenderLogEntry[];
  if (raw && typeof raw === 'object') return [raw as RenderLogEntry];
  // raw is a string (Render sends text/plain NDJSON in some versions)
  if (typeof raw === 'string') {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as RenderLogEntry; }
        catch { return { message: line } as RenderLogEntry; }
      });
  }
  return [];
};

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * POST /internal/logs/drain
 *
 * Accept Render's HTTP log-drain webhook and forward to Grafana Cloud Loki.
 * Returns 200 immediately (fast-ack) so Render doesn't retry.
 */
export const renderDrainHandler = (req: Request, res: Response): void => {
  // 1. Auth check — Render sends `Authorization: Bearer <RENDER_DRAIN_TOKEN>`.
  const cfg = getLokiConfig();
  if (cfg.drainToken) {
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token !== cfg.drainToken) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
  }

  // 2. Fast-ack so Render's drain never times out waiting for us.
  res.status(200).json({ success: true, received: true });

  // 3. Parse and forward (fire-and-forget).
  try {
    const entries = parseBody(req.body);
    if (entries.length > 0) pushToLoki(entries);
  } catch (err) {
    logger.warn('[log-drain] Failed to parse drain body', { error: (err as Error).message });
  }
};
