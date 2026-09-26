/** Dates in India time, e.g. "Mon, 5 Oct" / "5 Oct 2026, 3:40 pm". */
const tz = 'Asia/Kolkata';

export function shortDate(iso: string): string {
  // Date-only strings (delivery estimates) are calendar days, not instants.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00+05:30`) : new Date(iso);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  });
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: tz,
  });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  });
}

export function deliveryWindow(w: { from: string; to: string }): string {
  return w.from === w.to ? shortDate(w.to) : `${shortDate(w.from)} – ${shortDate(w.to)}`;
}
