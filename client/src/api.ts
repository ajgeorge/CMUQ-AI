import {
  ApiErrorSchema,
  type ChatRequest,
  type ChatResponse,
  type ClientsResponse,
  type HealthResponse,
  type ProductsResponse,
} from '@bank-sim/shared';

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
    if (parsed.success) {
      throw new ApiRequestError(parsed.data.error.message, res.status, parsed.data.error.code);
    }
    // Not our API's error format: something in between answered instead (e.g. a proxy
    // when the API server is down), so describe it plainly rather than show a status code.
    throw new ApiRequestError(
      res.status >= 500
        ? 'The server is not responding right now. Please try again in a moment.'
        : 'Something went wrong with that request. Please try again.',
      res.status,
      'UNKNOWN',
    );
  }

  return body as T;
}

export const api = {
  health: (signal?: AbortSignal) => request<HealthResponse>('/health', { signal }),
  clients: (signal?: AbortSignal) => request<ClientsResponse>('/clients', { signal }),
  products: (signal?: AbortSignal) => request<ProductsResponse>('/products', { signal }),
  chat: (body: ChatRequest, signal?: AbortSignal) =>
    request<ChatResponse>('/chat', { method: 'POST', body: JSON.stringify(body), signal }),
};

/** A message safe to show the student for any error thrown by the calls above. */
export function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError
    ? err.message
    : 'Something unexpected went wrong. Please try again.';
}
