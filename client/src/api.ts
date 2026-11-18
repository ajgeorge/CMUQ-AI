import { ApiErrorSchema, type HealthResponse } from '@bank-sim/shared';

/** Error thrown for any failed API call, carrying a message safe to show users. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiRequestError(
      'Could not reach the server. Check that it is running and try again.',
      0,
      'NETWORK_ERROR',
    );
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(parsed.data.error.message, res.status, parsed.data.error.code)
      : new ApiRequestError(`Request failed (HTTP ${res.status}).`, res.status, 'UNKNOWN');
  }

  return body as T;
}

export const api = {
  health: (signal?: AbortSignal) => request<HealthResponse>('/health', { signal }),
};
