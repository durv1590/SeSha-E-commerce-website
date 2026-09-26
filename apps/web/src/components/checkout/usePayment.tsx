'use client';

import type { PaymentSessionDto } from '@seshakart/types';
import { Button, Modal, formatINR } from '@seshakart/ui';
import { useCallback, useRef, useState } from 'react';
import { pay, type PaymentOutcome } from '@/lib/checkout/pay';

type MockChoice = 'success' | 'failure' | 'cancel';

/**
 * Runs a payment session. With the mock gateway (development only; production
 * refuses it) a clearly labelled test dialog stands in for the real payment window.
 */
export function usePayment() {
  const [mock, setMock] = useState<PaymentSessionDto | null>(null);
  const resolver = useRef<((c: MockChoice) => void) | null>(null);

  const run = useCallback(
    (session: PaymentSessionDto): Promise<PaymentOutcome> =>
      pay(
        session,
        () =>
          new Promise<MockChoice>((resolve) => {
            resolver.current = resolve;
            setMock(session);
          }),
      ),
    [],
  );

  const choose = (c: MockChoice) => {
    setMock(null);
    resolver.current?.(c);
    resolver.current = null;
  };

  const dialog = mock ? (
    <Modal
      open
      onClose={() => choose('cancel')}
      title="Test payment"
      description="Development mode: no real money moves. Choose what the payment gateway should report."
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => choose('cancel')}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => choose('failure')}>
            Simulate a failure
          </Button>
          <Button onClick={() => choose('success')}>Pay {formatINR(mock.amount)}</Button>
        </div>
      }
    >
      <p className="text-body">
        Order <strong>{mock.orderNumber}</strong> · {formatINR(mock.amount)}
      </p>
    </Modal>
  ) : null;

  return { run, dialog };
}
