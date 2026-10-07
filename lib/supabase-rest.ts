import 'server-only';

type SupabaseErrorPayload = {
  code?: string;
  message?: string;
};

export class SupabaseRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'SupabaseRequestError';
  }
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    throw new SupabaseRequestError(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.',
      503,
    );
  }

  return { url, serviceKey };
}

export async function supabaseRest<T>(
  resource: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, serviceKey } = getSupabaseConfig();
  const headers = new Headers(init.headers);
  headers.set('apikey', serviceKey);
  headers.set('Authorization', `Bearer ${serviceKey}`);
  headers.set('Accept', 'application/json');

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${url}/rest/v1/${resource.replace(/^\//, '')}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const text = await response.text();
  let payload: unknown;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = payload && typeof payload === 'object'
      ? payload as SupabaseErrorPayload
      : {};
    const status = error.code === '23505' ? 409 : error.code === 'PGRST202' ? 503 : response.status;
    const message = error.code === '23505'
      ? 'That participant identifier is already registered.'
      : error.code === 'PGRST202'
        ? 'Supabase cannot find the registration function. Run supabase/runtime-functions.sql in the Supabase SQL Editor, then retry.'
      : response.status >= 500
        ? 'Supabase could not complete the request. Check the server configuration and database.'
        : error.message || 'Supabase rejected the request.';

    throw new SupabaseRequestError(message, status, error.code);
  }

  return payload as T;
}

export function supabaseQuery(values: Record<string, string>) {
  return new URLSearchParams(values).toString();
}
