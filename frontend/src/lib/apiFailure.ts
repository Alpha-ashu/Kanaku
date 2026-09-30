import axios from 'axios';

/**
 * The server's own message for a failed backendService call.
 *
 * backendService's interceptor rejects with its own Error and keeps the axios
 * error on `.original`, so `err.response.data.error` — what components used to
 * read — is never set, and every failure fell through to a generic message.
 * This unwraps `.original` (and Blob error bodies from `responseType: 'blob'`)
 * and returns the message, the stable `code` to branch on, the HTTP status and
 * the server's request id for support.
 */

export interface ApiFailure {
  message: string;
  code?: string;
  status?: number;
  /** The server's per-request id — what support needs to find the log line. */
  requestId?: string;
  /** Structured extras the server attached (e.g. `{ required, available }`). */
  details?: Record<string, unknown>;
  /** No response at all: offline, or the client stopped waiting. */
  noResponse: boolean;
}

type ErrorBody = { error?: unknown; code?: unknown; requestId?: unknown; details?: unknown };

const bodyOf = async (data: unknown): Promise<ErrorBody | undefined> => {
  if (data && typeof data === 'object' && !(data instanceof Blob)) return data as ErrorBody;
  if (data instanceof Blob && data.type.includes('json')) {
    try {
      return JSON.parse(await data.text()) as ErrorBody;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export async function describeApiFailure(error: unknown, fallback: string): Promise<ApiFailure> {
  const original = (error as { original?: unknown } | null)?.original ?? error;
  if (axios.isAxiosError(original)) {
    if (!original.response) {
      const timedOut = original.code === 'ECONNABORTED' || original.code === 'ETIMEDOUT';
      return {
        message: timedOut
          ? 'The upload did not finish in time. Please check your connection and try again.'
          : 'Could not reach the server. Please check your connection and try again.',
        noResponse: true,
      };
    }
    const body = await bodyOf(original.response.data);
    return {
      message: typeof body?.error === 'string' && body.error.trim() ? body.error : fallback,
      code: typeof body?.code === 'string' ? body.code : undefined,
      status: original.response.status,
      requestId: typeof body?.requestId === 'string' ? body.requestId : undefined,
      details: body?.details && typeof body.details === 'object' ? body.details as Record<string, unknown> : undefined,
      noResponse: false,
    };
  }
  const message = error instanceof Error && error.message ? error.message : fallback;
  return { message, noResponse: false };
}

/** "Message (Ref: abcd1234)" when the server gave a request id. */
export const failureText = (failure: ApiFailure) =>
  failure.requestId ? `${failure.message} (Ref: ${failure.requestId.slice(0, 8)})` : failure.message;
