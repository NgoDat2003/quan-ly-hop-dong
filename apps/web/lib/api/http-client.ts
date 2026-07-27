import { getToken } from '@/lib/auth/auth-token';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Orval's react-query client (fetch mode) calls the mutator as
// customFetch<TResponse>(url, init), where TResponse is already the full
// { data, status, headers } shape generated per-endpoint. So this function
// constructs and returns that exact shape — it does not wrap a T inside
// another `data` layer.
export const customFetch = async <
  TResponse extends { data: unknown; status: number; headers: Headers },
>(
  url: string,
  init?: RequestInit,
): Promise<TResponse> => {
  const token = getToken();

  const response = await fetch(`${BASE_URL}${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.message ?? `HTTP ${response.status}`);
  }

  // 204 / empty body would crash response.json().
  const data =
    response.status === 204 || response.headers.get('content-length') === '0'
      ? undefined
      : await response.json();

  // NO unwrapping of `data` itself — deliberate. The API documents its
  // responses with envelope DTOs ({ statusCode, data }), so the Orval-
  // generated type IS the envelope and already matches this body exactly.
  // Unwrapping here would desync the generated types from what callers
  // actually receive. Call sites read `res.data.data` (fetch-wrapper `data`,
  // then the API's own envelope `data`).
  return { data, status: response.status, headers: response.headers } as TResponse;
};

export default customFetch;
