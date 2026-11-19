import OpenAI from 'openai';
import type { ApiErrorCode } from '@bank-sim/shared';

export type AiErrorCode = Extract<
  ApiErrorCode,
  | 'RATE_LIMITED'
  | 'AI_TOO_LARGE'
  | 'AI_TIMEOUT'
  | 'AI_UNAVAILABLE'
  | 'AI_CONFIG_ERROR'
  | 'AI_BAD_RESPONSE'
>;

/** What the student sees, and the HTTP status the API responds with, for each failure. */
const FAILURES: Record<AiErrorCode, { status: number; message: string }> = {
  RATE_LIMITED: {
    status: 429,
    message: 'The AI is busy right now. Please wait a moment and try again.',
  },
  AI_TOO_LARGE: {
    status: 413,
    message:
      "This interview is too long for the AI service's current usage limits, so it can't be " +
      'processed. Please let the administrator know.',
  },
  AI_TIMEOUT: {
    status: 504,
    message: 'The AI is taking too long to respond. Please try again.',
  },
  AI_UNAVAILABLE: {
    status: 503,
    message: 'The AI service is unavailable right now. Please try again shortly.',
  },
  AI_CONFIG_ERROR: {
    status: 500,
    message: 'The app is not configured correctly. Please let the administrator know.',
  },
  AI_BAD_RESPONSE: {
    status: 502,
    message: 'The AI gave an unusable response. Please try again.',
  },
};

/**
 * A failed AI call, already classified.
 * `message` is safe to show to the student; `detail` is for the server log only
 * (it may mention model names, provider errors, etc.).
 */
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly status: number;
  readonly detail: string;
  /** For rate limits: how long the provider asked us to wait, when it said. */
  readonly retryAfterMs: number | undefined;

  constructor(code: AiErrorCode, detail: string, retryAfterMs?: number) {
    super(FAILURES[code].message);
    this.name = 'AiError';
    this.code = code;
    this.status = FAILURES[code].status;
    this.detail = detail;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Turns anything the OpenAI SDK throws into an AiError.
 * Errors that don't come from the SDK are programming bugs, so they're rethrown untouched.
 */
export function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (!(err instanceof OpenAI.OpenAIError)) throw err;

  // Order matters: the timeout error is a subclass of the connection error.
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return new AiError('AI_TIMEOUT', 'The request timed out (after retries).');
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new AiError('AI_UNAVAILABLE', `Could not reach the AI provider: ${err.message}`);
  }
  if (!(err instanceof OpenAI.APIError)) {
    return new AiError('AI_BAD_RESPONSE', err.message);
  }

  const detail = err.message; // the SDK already starts this with the status code
  switch (err.status) {
    case 401:
    case 403:
      return new AiError('AI_CONFIG_ERROR', `The API key was rejected: ${detail}`);
    case 404:
      return new AiError('AI_CONFIG_ERROR', `Model or URL not found: ${detail}`);
    // Groq uses 413 when one request is bigger than the whole per-minute token allowance,
    // so waiting and retrying can never help (unlike 429).
    case 413:
      return new AiError('AI_TOO_LARGE', detail);
    case 429: {
      const seconds = Number(err.headers?.get('retry-after'));
      return new AiError(
        'RATE_LIMITED',
        detail,
        Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
      );
    }
    case 400:
    case 422:
      // JSON mode: the model produced something that isn't valid JSON.
      if (err.code === 'json_validate_failed') return new AiError('AI_BAD_RESPONSE', detail);
      return new AiError('AI_CONFIG_ERROR', `The provider rejected the request: ${detail}`);
    default:
      return new AiError('AI_UNAVAILABLE', detail);
  }
}
