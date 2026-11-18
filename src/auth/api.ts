// Chamadas ao servidor de contas do Xilo (mesma origem, cookie HttpOnly).

export interface User {
  id: string;
  name: string;
  email: string;
  admin: boolean;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'Não foi possível falar com o servidor.';
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const currentUser = (): Promise<{ user: User | null; emailEnabled: boolean }> => api('/api/auth/me');

export async function logout(): Promise<void> {
  await api('/api/auth/logout', 'POST');
  location.replace('/login');
}

/** Registra no servidor algo que só o navegador sabe (vídeo gerado, exportado). Nunca atrapalha o app. */
export function logEvent(kind: string, status: 'ok' | 'fail', detail: Record<string, string | number | boolean | null>): void {
  void api('/api/events', 'POST', { kind, status, detail }).catch(() => undefined);
}
