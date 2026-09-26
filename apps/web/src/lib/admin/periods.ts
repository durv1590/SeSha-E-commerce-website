/** India-time calendar helpers for report date presets. Dates are YYYY-MM-DD. */
const ymd = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });

export function todayIst(now = new Date()): string {
  return ymd(now);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

export function reportPresets(
  now = new Date(),
): { key: string; label: string; from: string; to: string }[] {
  const today = todayIst(now);
  const [y, m] = today.split('-').map(Number) as [number, number];
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
  // Indian financial year: 1 April – 31 March.
  const fyStartYear = m >= 4 ? y : y - 1;
  return [
    { key: '7d', label: 'Last 7 days', from: addDays(today, -6), to: today },
    { key: '30d', label: 'Last 30 days', from: addDays(today, -29), to: today },
    { key: 'month', label: 'This month', from: monthStart, to: today },
    { key: 'last-month', label: 'Last month', from: lastMonthStart, to: lastMonthEnd },
    {
      key: 'fy',
      label: `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`,
      from: `${fyStartYear}-04-01`,
      to: today,
    },
  ];
}
