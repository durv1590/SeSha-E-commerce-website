'use client';

import type { ServiceabilityDto } from '@seshakart/types';
import { cn } from '@seshakart/ui';
import { MapPin } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api/errors';
import { ordersApi } from '@/lib/orders/api';
import { deliveryWindow } from '@/lib/orders/format';

const KEY = 'sk_pincode';

/** PIN code checker: can we deliver here, by when, and is cash on delivery available? */
export function DeliveryCheck({ codAllowed }: { codAllowed: boolean }) {
  const id = useId();
  const [pincode, setPincode] = useState('');
  const [result, setResult] = useState<ServiceabilityDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (pin: string) => {
    if (!/^[1-9]\d{5}$/.test(pin)) return setError('Enter a valid 6-digit PIN code.');
    setBusy(true);
    setError(null);
    try {
      setResult(await ordersApi.serviceability(pin));
      try {
        localStorage.setItem(KEY, pin);
      } catch {
        // not remembered
      }
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'Couldn’t check this PIN code.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        setPincode(saved);
        void check(saved);
      }
    } catch {
      // storage unavailable
    }
  }, []);

  const cod = result && result.codAvailable && codAllowed;
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void check(pincode);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label
            htmlFor={`${id}-pin`}
            className="flex items-center gap-1.5 text-small font-semibold"
          >
            <MapPin size={16} aria-hidden="true" />
            Check delivery
          </label>
          <input
            id={`${id}-pin`}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="Enter PIN code"
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
            aria-describedby={`${id}-result`}
            aria-invalid={error ? true : undefined}
            className="h-control-md w-full min-w-0 rounded-input border border-border-strong bg-surface px-3 text-body"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="h-control-md rounded-button border border-primary px-4 text-small font-semibold text-primary hover:bg-primary-light hover:text-primary-dark disabled:opacity-60"
        >
          {busy ? 'Checking…' : 'Check'}
        </button>
      </form>
      <div id={`${id}-result`} aria-live="polite" className="mt-2 text-small">
        {error && <p className="text-error-text">{error}</p>}
        {result && !result.serviceable && (
          <p className="font-medium text-error-text">{result.message}</p>
        )}
        {result?.serviceable && (
          <ul className="flex flex-col gap-1">
            {result.standard && (
              <li>
                <strong>Standard delivery</strong> by{' '}
                {deliveryWindow({ from: result.standard.to, to: result.standard.to })}
              </li>
            )}
            {result.express && (
              <li>
                <strong>Express delivery</strong> by{' '}
                {deliveryWindow({ from: result.express.to, to: result.express.to })}
              </li>
            )}
            <li className={cn(cod ? 'text-success-text' : 'text-text-secondary')}>
              {cod ? 'Cash on delivery available' : 'Pay online for this item and PIN code'}
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
