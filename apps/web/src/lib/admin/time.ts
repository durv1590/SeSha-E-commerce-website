/** ISO instant ↔ the India-time value of a `datetime-local` input ("2026-10-02T00:00"). */
export const toLocalInput = (iso: string | null) =>
  iso
    ? new Date(iso)
        .toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata', hour12: false })
        .replace(' ', 'T')
        .slice(0, 16)
    : '';

export const fromLocalInput = (v: string) => (v ? `${v}:00+05:30` : null);

export const shortDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
