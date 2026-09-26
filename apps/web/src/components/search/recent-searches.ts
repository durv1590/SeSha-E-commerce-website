/**
 * Recent searches, kept only in this browser (never sent to the server).
 * Storage can be unavailable (private mode, blocked site data): every access is guarded.
 */
const KEY = 'sk_recent_searches';
const MAX = 6;

export function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

export function addRecent(query: string): string[] {
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!q) return readRecent();
  const next = [q, ...readRecent().filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(
    0,
    MAX,
  );
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: recent searches simply aren't remembered
  }
  return next;
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
