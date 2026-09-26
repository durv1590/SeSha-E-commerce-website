'use client';

import type { PaginationMeta } from '@seshakart/types';
import { ApiError } from './errors';

const CSRF_COOKIE = 'sk_csrf';

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function csrfToken(): Promise<string> {
  let token = readCookie(CSRF_COOKIE);
  if (!token) {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    token = readCookie(CSRF_COOKIE);
  }
  return token ?? '';
}

let refreshing: Promise<boolean> | null = null;

/** One shared refresh for concurrent 401s (avoids tripping refresh-token reuse detection). */
function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': await csrfToken() },
      });
      return res.ok;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export interface ApiResult<T> {
  data: T;
  meta?: PaginationMeta;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Browser API client. Calls go through the storefront origin (/api/* is proxied to
 * the API), carry HttpOnly auth cookies automatically, send the CSRF header on
 * writes, and transparently renew an expired access token once.
 */
export async function apiRequest<T>(
  method: Method,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ApiResult<T>> {
  const send = async () =>
    fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'x-csrf-token': await csrfToken() } : {}),
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res: Response;
  try {
    res = await send();
    const renewable = !/^\/auth\/(login|register|refresh|otp|password|logout)/.test(path);
    if (res.status === 401 && renewable && readCookie('sk_sess') && (await refreshSession()))
      res = await send();
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'We couldn’t reach SeShaKart. Check your connection and try again.',
    );
  }
  if (res.status === 204) return { data: undefined as T };
  if (!res.ok) throw await ApiError.fromResponse(res);
  return (await res.json()) as ApiResult<T>;
}

/** True when the browser holds a session marker (i.e. is probably signed in). */
export function hasSession(): boolean {
  return typeof document !== 'undefined' && Boolean(readCookie('sk_sess'));
}

export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path).then((r) => r.data),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>('POST', path, body ?? {}).then((r) => r.data),
  patch: <T>(path: string, body: unknown) => apiRequest<T>('PATCH', path, body).then((r) => r.data),
  delete: <T = void>(path: string) => apiRequest<T>('DELETE', path).then((r) => r.data),
};
