/** Only same-site relative paths may be used as post-login destinations (no open redirects). */
export function safeRedirectPath(value: string | null | undefined, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return fallback;
  return value.slice(0, 500);
}
