'use client';

import type { InventoryLedgerEntryDto, InventoryRowDto } from '@seshakart/types';
import {
  Alert,
  Button,
  Drawer,
  FormField,
  Input,
  Modal,
  Skeleton,
  StockBadge,
  cn,
  useToast,
} from '@seshakart/ui';
import { stockAdjustmentSchema } from '@seshakart/validation';
import { History, SlidersHorizontal } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, apiRequest } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { AdminTable, td, th } from '../AdminTable';

const MODES = [
  { value: 'add', label: 'Add stock', hint: 'Goods received' },
  { value: 'remove', label: 'Remove stock', hint: 'Damaged, lost or returned to supplier' },
  { value: 'set', label: 'Set count', hint: 'After a stock count' },
] as const;

const TX_LABEL: Record<InventoryLedgerEntryDto['type'], string> = {
  ADJUSTMENT: 'Adjustment',
  RESTOCK: 'Stock received',
  RESERVE: 'Reserved for order',
  RELEASE: 'Reservation released',
  SALE: 'Sold',
  RETURN: 'Returned',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

export function InventoryTable({ rows, canWrite }: { rows: InventoryRowDto[]; canWrite: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [adjusting, setAdjusting] = useState<InventoryRowDto | null>(null);
  const [history, setHistory] = useState<InventoryRowDto | null>(null);
  const [mode, setMode] = useState<'add' | 'remove' | 'set'>('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [threshold, setThreshold] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openAdjust = (r: InventoryRowDto) => {
    setAdjusting(r);
    setMode('add');
    setQuantity('');
    setReason('');
    setThreshold(String(r.lowStockThreshold));
    setErrors({});
    setFormError(null);
  };

  const n = /^\d+$/.test(quantity.trim()) ? Number(quantity) : null;
  const preview =
    adjusting && n !== null
      ? mode === 'add'
        ? adjusting.stock + n
        : mode === 'remove'
          ? adjusting.stock - n
          : n
      : null;

  const save = async () => {
    if (!adjusting) return;
    const errs: Record<string, string> = {};
    const thresholdChanged = threshold.trim() !== String(adjusting.lowStockThreshold);
    const wantsStock = quantity.trim() !== '' || !thresholdChanged;
    if (thresholdChanged && !/^\d+$/.test(threshold.trim()))
      errs.lowStockThreshold = 'Enter a whole number';
    let body: unknown;
    if (wantsStock) {
      const parsed = stockAdjustmentSchema.safeParse({ mode, quantity: n ?? -1, reason });
      if (n === null) errs.quantity = 'Enter a whole number';
      else if (!parsed.success)
        for (const i of parsed.error.issues) errs[i.path.join('.')] ??= i.message;
      body = parsed.success ? parsed.data : undefined;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setFormError(null);
    try {
      if (wantsStock) await api.post(`/admin/inventory/${adjusting.variantId}/adjust`, body);
      if (thresholdChanged)
        await api.patch(`/admin/inventory/${adjusting.variantId}`, {
          lowStockThreshold: Number(threshold),
        });
      toast({ title: `Stock updated for ${adjusting.sku}`, variant: 'success' });
      setAdjusting(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setFormError(err.message);
      } else setFormError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AdminTable label="Stock by variant">
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            <th scope="col" className={th}>
              Product
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              In stock
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Reserved
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Available
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Alert at
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.variantId}
              className={cn(
                'border-t border-border first:border-t-0',
                !r.isActive && 'text-text-muted',
              )}
            >
              <td className={td}>
                <div className="flex items-center gap-3">
                  <span className="relative block size-10 shrink-0 overflow-hidden rounded-sm border border-border bg-surface">
                    {r.imageUrl && (
                      <Image
                        src={r.imageUrl}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-contain p-0.5"
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <Link
                      href={`/admin/products/${r.productId}`}
                      className="line-clamp-1 font-medium text-text-primary hover:text-primary-dark"
                    >
                      {r.productName}
                    </Link>
                    <span className="block text-caption text-text-muted">
                      {r.variantName} · <span className="font-mono">{r.sku}</span>
                      {!r.isActive && ' · inactive'}
                      {r.productStatus !== 'ACTIVE' &&
                        ` · ${r.productStatus === 'DRAFT' ? 'draft' : 'archived'}`}
                    </span>
                  </span>
                </div>
              </td>
              <td className={cn(td, 'text-right tabular-nums')}>{r.stock}</td>
              <td className={cn(td, 'text-right tabular-nums')}>{r.reserved}</td>
              <td className={cn(td, 'text-right')}>
                <span className="inline-flex flex-col items-end gap-1">
                  <span className="font-semibold tabular-nums">{r.available}</span>
                  <StockBadge state={r.state} />
                </span>
              </td>
              <td className={cn(td, 'text-right tabular-nums')}>{r.lowStockThreshold}</td>
              <td className={cn(td, 'text-right')}>
                <span className="inline-flex gap-1">
                  {canWrite && (
                    <Button size="sm" variant="outline" onClick={() => openAdjust(r)}>
                      <SlidersHorizontal size={14} aria-hidden="true" /> Adjust
                      <span className="sr-only"> {r.sku}</span>
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Stock history for ${r.sku}`}
                    onClick={() => setHistory(r)}
                  >
                    <History size={16} aria-hidden="true" />
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTable>

      <Modal
        open={Boolean(adjusting)}
        onClose={() => !saving && setAdjusting(null)}
        title="Adjust stock"
        description={
          adjusting
            ? `${adjusting.productName} · ${adjusting.variantName} (${adjusting.sku})`
            : undefined
        }
        size="md"
        footer={
          <>
            <Button variant="outline" disabled={saving} onClick={() => setAdjusting(null)}>
              Cancel
            </Button>
            <Button loading={saving} loadingText="Saving…" onClick={() => void save()}>
              Save
            </Button>
          </>
        }
      >
        {adjusting && (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {formError && <Alert variant="error">{formError}</Alert>}
            <p className="text-small text-text-secondary">
              {adjusting.stock} in stock, {adjusting.reserved} reserved for open orders.
            </p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-small font-medium">Change</legend>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-3">
                {MODES.map((m) => (
                  <label
                    key={m.value}
                    className={cn(
                      'flex cursor-pointer flex-col rounded-md border p-2.5 text-small has-[:focus-visible]:shadow-focus',
                      mode === m.value ? 'border-primary bg-primary-light' : 'border-border',
                    )}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <input
                        type="radio"
                        name="mode"
                        value={m.value}
                        checked={mode === m.value}
                        onChange={() => setMode(m.value)}
                        className="accent-[rgb(var(--color-primary))]"
                      />
                      {m.label}
                    </span>
                    <span className="text-caption text-text-secondary">{m.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <FormField
              label={mode === 'set' ? 'New stock count' : 'Quantity'}
              error={errors.quantity}
              hint={
                preview !== null
                  ? `Stock will be ${preview}${preview < adjusting.reserved ? ` — below the ${adjusting.reserved} reserved` : ''}`
                  : undefined
              }
            >
              <Input
                name="quantity"
                value={quantity}
                inputMode="numeric"
                onChange={(e) => setQuantity(e.target.value)}
              />
            </FormField>
            <FormField label="Reason" hint="Recorded in the stock history" error={errors.reason}>
              <Input
                name="reason"
                value={reason}
                maxLength={200}
                placeholder="e.g. Delivery from supplier, invoice 1432"
                onChange={(e) => setReason(e.target.value)}
              />
            </FormField>
            <FormField
              label="Low-stock alert at"
              hint="Flag this variant when available units fall to this number"
              error={errors.lowStockThreshold}
            >
              <Input
                name="lowStockThreshold"
                value={threshold}
                inputMode="numeric"
                className="max-w-32"
                onChange={(e) => setThreshold(e.target.value)}
              />
            </FormField>
          </form>
        )}
      </Modal>

      <Drawer
        open={Boolean(history)}
        onClose={() => setHistory(null)}
        side="right"
        title="Stock history"
        description={
          history ? `${history.productName} · ${history.variantName} (${history.sku})` : undefined
        }
      >
        {history && <Ledger variantId={history.variantId} />}
      </Drawer>
    </>
  );
}

function Ledger({ variantId }: { variantId: string }) {
  const [entries, setEntries] = useState<InventoryLedgerEntryDto[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    apiRequest<InventoryLedgerEntryDto[]>(
      'GET',
      `/admin/inventory/${variantId}/ledger?page=${page}&pageSize=25`,
    )
      .then((r) => {
        if (!live) return;
        setEntries((prev) => (page === 1 ? r.data : [...(prev ?? []), ...r.data]));
        setTotalPages(r.meta?.totalPages ?? 1);
      })
      .catch(() => live && setError('Couldn’t load the history.'));
    return () => {
      live = false;
    };
  }, [variantId, page]);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!entries) return <Skeleton className="h-48 w-full" aria-label="Loading history" />;
  if (!entries.length) return <p className="text-small text-text-muted">No stock movements yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col divide-y divide-border">
        {entries.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5 py-2.5 text-small">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{TX_LABEL[e.type]}</span>
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  e.quantity > 0 ? 'text-success-text' : e.quantity < 0 ? 'text-error-text' : '',
                )}
              >
                {e.type === 'RESERVE' || e.type === 'RELEASE'
                  ? `${e.type === 'RESERVE' ? '' : '−'}${Math.abs(e.quantity)} reserved`
                  : `${e.quantity > 0 ? '+' : e.quantity < 0 ? '−' : ''}${Math.abs(e.quantity)}`}
              </span>
            </span>
            <span className="text-caption text-text-muted">
              {when(e.createdAt)} · stock {e.stockAfter}, reserved {e.reservedAfter}
            </span>
            {(e.reason || e.orderNumber || e.actor) && (
              <span className="text-caption text-text-secondary">
                {[e.reason, e.orderNumber && `Order ${e.orderNumber}`, e.actor && `by ${e.actor}`]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </li>
        ))}
      </ol>
      {page < totalPages && (
        <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
          Show older
        </Button>
      )}
    </div>
  );
}
