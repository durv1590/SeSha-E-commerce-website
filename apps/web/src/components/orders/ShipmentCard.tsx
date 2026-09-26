import type { ShipmentDto } from '@seshakart/types';
import { ExternalLink, Truck } from 'lucide-react';
import { dateTime, shortDate } from '@/lib/orders/format';

export function ShipmentCard({ shipment }: { shipment: ShipmentDto }) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Truck size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">
              {shipment.isReturn ? 'Return pickup · ' : ''}
              {shipment.carrierName}
            </p>
            {shipment.trackingNumber && (
              <p className="text-small text-text-secondary">
                Tracking number{' '}
                <span className="font-mono font-semibold text-text-primary">
                  {shipment.trackingNumber}
                </span>
              </p>
            )}
            {shipment.estimatedDelivery && !shipment.deliveredAt && (
              <p className="text-small text-text-secondary">
                Expected by {shortDate(shipment.estimatedDelivery)}
              </p>
            )}
          </div>
        </div>
        {shipment.trackingUrl && (
          <a
            href={shipment.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-small font-semibold"
          >
            Track on {shipment.carrierName}
            <ExternalLink size={14} aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
      {shipment.events.length > 0 && (
        <ol
          className="mt-4 flex flex-col gap-3 border-l-2 border-border pl-4"
          aria-label="Tracking updates"
        >
          {shipment.events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="text-small">
              <p className="font-semibold">{e.label}</p>
              <p className="text-text-muted">
                {dateTime(e.at)}
                {e.location ? ` · ${e.location}` : ''}
              </p>
              {e.note && <p className="text-text-secondary">{e.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
