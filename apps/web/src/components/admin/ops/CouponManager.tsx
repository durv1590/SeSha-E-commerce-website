'use client';

import type { AdminCategoryDto, AdminCouponDto } from '@seshakart/types';
import {
  Badge,
  Button,
  Checkbox,
  FormField,
  Input,
  Radio,
  Select,
  cn,
  formatINR,
  useToast,
} from '@seshakart/ui';
import { couponInputSchema } from '@seshakart/validation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { paiseToRupees, rupeesToPaise } from '@/lib/admin/money';
import { fromLocalInput, toLocalInput } from '@/lib/admin/time';
import { AdminTable, td, th } from '../AdminTable';
import { ConfirmDialog } from '../ConfirmDialog';
import { FormDialog } from '../FormDialog';

const STATE: Record<
  AdminCouponDto['state'],
  { label: string; badge: 'success' | 'info' | 'neutral' | 'warning' }
> = {
  live: { label: 'Live', badge: 'success' },
  scheduled: { label: 'Scheduled', badge: 'info' },
  expired: { label: 'Expired', badge: 'neutral' },
  exhausted: { label: 'Used up', badge: 'warning' },
  inactive: { label: 'Off', badge: 'neutral' },
};

interface Draft {
  code: string;
  description: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: string;
  maxDiscount: string;
  minCartValue: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  usagePerUser: string;
  firstOrderOnly: boolean;
  categoryIds: string[];
  productIds: string[];
  isActive: boolean;
}

const toDraft = (c?: AdminCouponDto): Draft => ({
  code: c?.code ?? '',
  description: c?.description ?? '',
  type: c?.type ?? 'PERCENTAGE',
  value: c ? (c.type === 'PERCENTAGE' ? String(c.value) : paiseToRupees(c.value)) : '',
  maxDiscount: c?.maxDiscount ? paiseToRupees(c.maxDiscount) : '',
  minCartValue: c?.minCartValue ? paiseToRupees(c.minCartValue) : '',
  startsAt: toLocalInput(c?.startsAt ?? null),
  endsAt: toLocalInput(c?.endsAt ?? null),
  usageLimit: c?.usageLimit ? String(c.usageLimit) : '',
  usagePerUser: String(c?.usagePerUser ?? 1),
  firstOrderOnly: c?.firstOrderOnly ?? false,
  categoryIds: c?.categoryIds ?? [],
  productIds: c?.productIds ?? [],
  isActive: c?.isActive ?? true,
});

export function describeCoupon(c: AdminCouponDto): string {
  const off = c.type === 'PERCENTAGE' ? `${c.value}% off` : `${formatINR(c.value)} off`;
  const cap = c.maxDiscount ? ` (up to ${formatINR(c.maxDiscount)})` : '';
  const min = c.minCartValue ? ` on orders over ${formatINR(c.minCartValue)}` : '';
  return `${off}${cap}${min}`;
}

export function CouponManager({
  coupons,
  categories,
}: {
  coupons: AdminCouponDto[];
  categories: AdminCategoryDto[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<{ coupon?: AdminCouponDto; d: Draft } | null>(null);
  const [deleting, setDeleting] = useState<AdminCouponDto | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setEditing((e) => (e ? { ...e, d: { ...e.d, [k]: v } } : e));
  const d = editing?.d;

  const toPayload = (d: Draft): { payload?: unknown; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};
    const money = (k: keyof Draft, v: string, optional: boolean) => {
      if (!v.trim()) return optional ? null : undefined;
      const p = rupeesToPaise(v);
      if (p === null) errors[k] = 'Enter an amount like 500 or 499.50';
      return p;
    };
    const int = (k: keyof Draft, v: string) => {
      if (!v.trim()) return null;
      if (!/^\d+$/.test(v.trim())) errors[k] = 'Enter a whole number';
      return Number(v);
    };
    const value =
      d.type === 'PERCENTAGE'
        ? /^\d+$/.test(d.value.trim())
          ? Number(d.value)
          : ((errors.value = 'Enter a whole percentage'), 0)
        : (money('value', d.value, false) ?? ((errors.value ||= 'Enter an amount'), 0));
    const payload = {
      code: d.code,
      description: d.description,
      type: d.type,
      value,
      maxDiscount: d.type === 'PERCENTAGE' ? money('maxDiscount', d.maxDiscount, true) : null,
      minCartValue: money('minCartValue', d.minCartValue, true) ?? 0,
      startsAt: fromLocalInput(d.startsAt),
      endsAt: fromLocalInput(d.endsAt),
      usageLimit: int('usageLimit', d.usageLimit),
      usagePerUser: int('usagePerUser', d.usagePerUser) ?? 1,
      firstOrderOnly: d.firstOrderOnly,
      categoryIds: d.categoryIds,
      productIds: d.productIds,
      isActive: d.isActive,
    };
    const parsed = couponInputSchema.safeParse(payload);
    if (!parsed.success)
      for (const i of parsed.error.issues) errors[i.path.join('.')] ??= i.message;
    return { payload, errors };
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => setEditing({ d: toDraft() })}>
          <Plus size={16} aria-hidden="true" /> Add coupon
        </Button>
      </div>
      {coupons.length === 0 ? (
        <p className="text-small text-text-muted">No coupons in this view.</p>
      ) : (
        <AdminTable label="Coupons">
          <thead className="border-b border-border bg-surface-muted">
            <tr>
              <th scope="col" className={th}>
                Code
              </th>
              <th scope="col" className={th}>
                Offer
              </th>
              <th scope="col" className={th}>
                Status
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                Used
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                Discount given
              </th>
              <th scope="col" className={th}>
                Ends
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-border first:border-t-0">
                <th scope="row" className={cn(td, 'text-left font-mono font-semibold')}>
                  {c.code}
                </th>
                <td className={td}>
                  <span className="block">{describeCoupon(c)}</span>
                  {(c.firstOrderOnly || c.categoryIds.length > 0 || c.productIds.length > 0) && (
                    <span className="block text-caption text-text-muted">
                      {[
                        c.firstOrderOnly && 'First order only',
                        c.categoryIds.length &&
                          `${c.categoryIds.length} categor${c.categoryIds.length === 1 ? 'y' : 'ies'}`,
                        c.productIds.length &&
                          `${c.productIds.length} product${c.productIds.length === 1 ? '' : 's'}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </td>
                <td className={td}>
                  <Badge variant={STATE[c.state].badge}>{STATE[c.state].label}</Badge>
                </td>
                <td className={cn(td, 'text-right tabular-nums')}>
                  {c.usedCount}
                  {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                </td>
                <td className={cn(td, 'text-right tabular-nums')}>{formatINR(c.discountGiven)}</td>
                <td className={cn(td, 'whitespace-nowrap text-text-secondary')}>
                  {c.endsAt
                    ? new Date(c.endsAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'Asia/Kolkata',
                      })
                    : 'No end date'}
                </td>
                <td className={cn(td, 'text-right')}>
                  <span className="inline-flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Edit ${c.code}`}
                      onClick={() => setEditing({ coupon: c, d: toDraft(c) })}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${c.code}`}
                      onClick={() => setDeleting(c)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.coupon ? `Edit ${editing.coupon.code}` : 'Add coupon'}
        description="Prices include GST; the discount comes off the item total before delivery fees."
        submitLabel="Save"
        onSubmit={async () => {
          if (!editing) return;
          const { payload, errors } = toPayload(editing.d);
          if (Object.keys(errors).length) return errors;
          if (editing.coupon) await api.put(`/admin/coupons/${editing.coupon.id}`, payload);
          else await api.post('/admin/coupons', payload);
          toast({ title: editing.coupon ? 'Coupon saved' : 'Coupon created', variant: 'success' });
          router.refresh();
        }}
      >
        {(e) =>
          d && (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                <FormField
                  label="Code"
                  required
                  hint="Shoppers type this at checkout"
                  error={e.code}
                >
                  <Input
                    name="code"
                    value={d.code}
                    maxLength={32}
                    autoCapitalize="characters"
                    spellCheck={false}
                    onChange={(ev) => set('code', ev.target.value.toUpperCase())}
                  />
                </FormField>
                <FormField label="Description" hint="Shown to shoppers" error={e.description}>
                  <Input
                    name="description"
                    value={d.description}
                    maxLength={200}
                    onChange={(ev) => set('description', ev.target.value)}
                  />
                </FormField>
              </div>
              <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
                <legend className="mb-2 text-small font-medium">Discount type</legend>
                <Radio
                  name="type"
                  label="Percentage"
                  checked={d.type === 'PERCENTAGE'}
                  onChange={() => set('type', 'PERCENTAGE')}
                />
                <Radio
                  name="type"
                  label="Fixed amount"
                  checked={d.type === 'FIXED'}
                  onChange={() => set('type', 'FIXED')}
                />
              </fieldset>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-3">
                <FormField
                  label={d.type === 'PERCENTAGE' ? 'Discount (%)' : 'Discount (₹)'}
                  required
                  error={e.value}
                >
                  <Input
                    name="value"
                    value={d.value}
                    inputMode="decimal"
                    onChange={(ev) => set('value', ev.target.value)}
                  />
                </FormField>
                {d.type === 'PERCENTAGE' && (
                  <FormField label="Maximum discount (₹)" hint="Optional cap" error={e.maxDiscount}>
                    <Input
                      name="maxDiscount"
                      value={d.maxDiscount}
                      inputMode="decimal"
                      onChange={(ev) => set('maxDiscount', ev.target.value)}
                    />
                  </FormField>
                )}
                <FormField label="Minimum order (₹)" error={e.minCartValue}>
                  <Input
                    name="minCartValue"
                    value={d.minCartValue}
                    inputMode="decimal"
                    onChange={(ev) => set('minCartValue', ev.target.value)}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                <FormField label="Starts" hint="India time; blank = now" error={e.startsAt}>
                  <Input
                    name="startsAt"
                    type="datetime-local"
                    value={d.startsAt}
                    onChange={(ev) => set('startsAt', ev.target.value)}
                  />
                </FormField>
                <FormField label="Ends" hint="India time; blank = never" error={e.endsAt}>
                  <Input
                    name="endsAt"
                    type="datetime-local"
                    value={d.endsAt}
                    onChange={(ev) => set('endsAt', ev.target.value)}
                  />
                </FormField>
                <FormField label="Total uses" hint="Blank = unlimited" error={e.usageLimit}>
                  <Input
                    name="usageLimit"
                    value={d.usageLimit}
                    inputMode="numeric"
                    onChange={(ev) => set('usageLimit', ev.target.value)}
                  />
                </FormField>
                <FormField label="Uses per customer" error={e.usagePerUser}>
                  <Input
                    name="usagePerUser"
                    value={d.usagePerUser}
                    inputMode="numeric"
                    onChange={(ev) => set('usagePerUser', ev.target.value)}
                  />
                </FormField>
              </div>
              <FormField
                label="Only for these categories"
                hint="Leave empty for the whole store. Hold Ctrl/Cmd to choose several."
                error={e.categoryIds}
              >
                <Select
                  name="categoryIds"
                  multiple
                  size="md"
                  className="h-36 py-1"
                  value={d.categoryIds}
                  onChange={(ev) =>
                    set(
                      'categoryIds',
                      [...ev.target.selectedOptions].map((o) => o.value),
                    )
                  }
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {' '.repeat(c.depth)}
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              {d.productIds.length > 0 && (
                <p className="text-caption text-text-muted">
                  Also limited to {d.productIds.length} specific product(s).
                </p>
              )}
              <Checkbox
                label="First order only"
                description="Only for customers who haven’t ordered before (requires sign-in)"
                checked={d.firstOrderOnly}
                onChange={(ev) => set('firstOrderOnly', ev.target.checked)}
              />
              <Checkbox
                label="Active"
                description="Untick to switch the coupon off without deleting it"
                checked={d.isActive}
                onChange={(ev) => set('isActive', ev.target.checked)}
              />
            </>
          )
        }
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.code ?? 'coupon'}?`}
        description="Only coupons that were never used can be deleted. Used coupons can be switched off instead."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await api.delete(`/admin/coupons/${deleting!.id}`);
          toast({ title: 'Coupon deleted', variant: 'success' });
          router.refresh();
        }}
      />
    </div>
  );
}
