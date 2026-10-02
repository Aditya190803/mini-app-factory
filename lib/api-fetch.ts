/**
 * Client helpers for calling this app's API routes.
 *
 * Routes answer errors as `{ error, code?, requestId?, ... }`. Callers used to parse that by hand
 * in ~20 places, each slightly differently (some threw on a non-JSON body, some lost `code`).
 */

export type ApiError = {
  message: string;
  status: number;
  code?: string;
  requestId?: string;
  retryAfter?: number;
  needsConfirmation?: boolean;
};

export class ApiRequestError extends Error implements ApiError {
  status: number;
  code?: string;
  requestId?: string;
  retryAfter?: number;
  needsConfirmation?: boolean;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.status = error.status;
    this.code = error.code;
    this.requestId = error.requestId;
    this.retryAfter = error.retryAfter;
    this.needsConfirmation = error.needsConfirmation;
  }
}

/** Read the error body of a failed response, tolerating non-JSON bodies. */
export async function readApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const text = (key: string) => (typeof body?.[key] === 'string' ? (body[key] as string) : undefined);
  return {
    message: text('error') ?? text('message') ?? `Request failed (${response.status})`,
    status: response.status,
    code: text('code'),
    requestId: text('requestId'),
    retryAfter: typeof body?.retryAfter === 'number' ? body.retryAfter : undefined,
    needsConfirmation: body?.needsConfirmation === true,
  };
}

/**
 * `fetch` a JSON API route. Resolves with the parsed body on success and throws an
 * `ApiRequestError` on failure. Objects passed as `json` are sent as a JSON body.
 */
export async function apiFetch<T>(
  input: string,
  init: Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit } = {}
): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(input, {
    ...rest,
    headers: json === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: json === undefined ? init.body : JSON.stringify(json),
  });
  if (!response.ok) throw new ApiRequestError(await readApiError(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
