'use client';

import { Button } from '@seshakart/ui';
import { useEffect, useState } from 'react';

/** "Resend code" button that waits out the server's 60-second resend window. */
export function ResendTimer({
  onResend,
  seconds = 60,
}: {
  onResend: () => Promise<void>;
  seconds?: number;
}) {
  const [left, setLeft] = useState(seconds);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  return (
    <Button
      variant="link"
      disabled={left > 0 || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onResend();
          setLeft(seconds);
        } finally {
          setBusy(false);
        }
      }}
    >
      {left > 0 ? `Resend code in ${left}s` : 'Resend code'}
    </Button>
  );
}
