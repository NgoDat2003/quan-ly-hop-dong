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
const REFRESH_PATH = '/auth/refresh';

async function performFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${url}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

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
  let response = await performFetch(url, init);

  // Access token expired mid-session (15m TTL) — try one silent refresh and
  // replay the original request. Exclude /auth/refresh itself from this
  // retry path, or a failing refresh call would recursively trigger
  // another refresh forever.
  if (response.status === 401 && !url.endsWith(REFRESH_PATH)) {
    let refreshResponse = await performFetch(REFRESH_PATH, { method: 'POST' });
    // 409: another concurrent request refreshed this exact session first
    // (benign race — backend's compare-and-swap rotate). Not a real
    // logout, just means someone else already won the refresh — one more
    // attempt now succeeds against the already-rotated cookie.
    if (refreshResponse.status === 409) {
      refreshResponse = await performFetch(REFRESH_PATH, { method: 'POST' });
    }
    if (refreshResponse.ok) {
      response = await performFetch(url, init);
    }
  }

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
