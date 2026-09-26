'use client';

import { TRACKING_CONFIGURED } from '@/lib/analytics/config';
import { OPEN_CONSENT_EVENT } from '@/lib/analytics/consent';

/** Footer link that reopens the cookie banner. Hidden when no optional cookies exist. */
export function CookieSettingsButton({ className }: { className?: string }) {
  if (!TRACKING_CONFIGURED) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      Cookie settings
    </button>
  );
}
