'use client';

import { INDIAN_STATES } from '@seshakart/types';
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  Input,
  Select,
  Textarea,
  useToast,
} from '@seshakart/ui';
import { SETTINGS_SCHEMAS, type SettingsKey } from '@seshakart/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { paiseToRupees, rupeesToPaise } from '@/lib/admin/money';

/**
 * Settings groups rendered from field specs. Values are converted to and from the
 * stored shape (paise, numbers, lists) and validated with the same schema the API
 * uses before saving.
 */

type Field =
  | {
      key: string;
      label: string;
      hint?: string;
      kind: 'text' | 'email' | 'tel' | 'textarea';
      max?: number;
    }
  | { key: string; label: string; hint?: string; kind: 'money' | 'int' }
  | { key: string; label: string; hint?: string; kind: 'bool' }
  | { key: string; label: string; hint?: string; kind: 'state' }
  | { key: string; label: string; hint?: string; kind: 'list' | 'lines' }
  | { key: string; label: string; hint?: string; kind: 'range' };

interface Group {
  title: string;
  description?: string;
  fields: Field[];
}

export const SETTINGS_FORMS: Record<SettingsKey, Group[]> = {
  store: [
    {
      title: 'Store details',
      description: 'Shown across the store, in emails and on invoices.',
      fields: [
        { key: 'name', label: 'Store name', kind: 'text', max: 80 },
        { key: 'tagline', label: 'Tagline', kind: 'text', max: 120 },
        { key: 'supportEmail', label: 'Support email', kind: 'email' },
        {
          key: 'supportPhone',
          label: 'Support phone',
          hint: '10-digit mobile number',
          kind: 'tel',
        },
      ],
    },
    {
      title: 'Business and GST',
      description:
        'Printed on GST invoices. The registered state decides CGST + SGST (same state) or IGST.',
      fields: [
        { key: 'legalName', label: 'Legal name', kind: 'text', max: 120 },
        {
          key: 'gstin',
          label: 'GSTIN',
          hint: '15 characters; leave empty until registered',
          kind: 'text',
          max: 15,
        },
        { key: 'registeredState', label: 'Registered state', kind: 'state' },
        { key: 'registeredAddress', label: 'Registered address', kind: 'textarea', max: 300 },
      ],
    },
  ],
  commerce: [
    {
      title: 'Delivery charges',
      fields: [
        {
          key: 'freeShippingThreshold',
          label: 'Free delivery from (₹)',
          hint: 'Order value (after coupon) that ships free',
          kind: 'money',
        },
        { key: 'standardShippingFee', label: 'Standard delivery fee (₹)', kind: 'money' },
        { key: 'expressEnabled', label: 'Offer express delivery', kind: 'bool' },
        { key: 'expressShippingFee', label: 'Express delivery fee (₹)', kind: 'money' },
      ],
    },
    {
      title: 'Cash on delivery',
      fields: [
        { key: 'codEnabled', label: 'Offer cash on delivery', kind: 'bool' },
        { key: 'codFee', label: 'COD fee (₹)', kind: 'money' },
        { key: 'codMaxOrderValue', label: 'Maximum COD order (₹)', kind: 'money' },
      ],
    },
    {
      title: 'Cart and checkout',
      fields: [
        {
          key: 'maxQuantityPerItem',
          label: 'Maximum quantity per item',
          hint: '1–99',
          kind: 'int',
        },
        {
          key: 'stockReservationMinutes',
          label: 'Hold stock during online payment (minutes)',
          hint: '5–120',
          kind: 'int',
        },
        {
          key: 'cartRetentionDays',
          label: 'Keep abandoned carts (days)',
          hint: '1–365',
          kind: 'int',
        },
      ],
    },
  ],
  shipping: [
    {
      title: 'Delivery times',
      description:
        'Business days (Monday–Saturday) from order to delivery, shown on product pages and at checkout.',
      fields: [
        { key: 'standardDays', label: 'Standard delivery', kind: 'range' },
        { key: 'expressDays', label: 'Express delivery', kind: 'range' },
      ],
    },
    {
      title: 'Areas',
      description:
        'PIN code prefixes, separated by commas (e.g. 744, 79). A prefix matches every PIN code that starts with it.',
      fields: [
        {
          key: 'remotePrefixes',
          label: 'Remote areas',
          hint: 'Take longer to reach',
          kind: 'list',
        },
        { key: 'remoteExtraDays', label: 'Extra days for remote areas', kind: 'int' },
        { key: 'expressToRemote', label: 'Offer express delivery to remote areas', kind: 'bool' },
        {
          key: 'blockedPrefixes',
          label: 'No delivery',
          hint: 'We can’t deliver to these areas at all',
          kind: 'list',
        },
        { key: 'codBlockedPrefixes', label: 'No cash on delivery', kind: 'list' },
      ],
    },
  ],
  search: [
    {
      title: 'Search suggestions',
      fields: [
        {
          key: 'trending',
          label: 'Trending searches',
          hint: 'One per line, up to 10. Shown in the search box before shoppers type.',
          kind: 'lines',
        },
        {
          key: 'popularMinCount',
          label: 'Minimum searches before a term counts as popular',
          kind: 'int',
        },
      ],
    },
  ],
};

type Values = Record<string, unknown>;
type Text = Record<string, string | boolean>;

export function toText(fields: Field[], v: Values): Text {
  const t: Text = {};
  for (const f of fields) {
    const val = v[f.key];
    if (f.kind === 'bool') t[f.key] = Boolean(val);
    else if (f.kind === 'money') t[f.key] = paiseToRupees(Number(val ?? 0));
    else if (f.kind === 'list') t[f.key] = ((val as string[]) ?? []).join(', ');
    else if (f.kind === 'lines') t[f.key] = ((val as string[]) ?? []).join('\n');
    else if (f.kind === 'range') {
      const r = (val as { min: number; max: number }) ?? { min: 0, max: 0 };
      t[`${f.key}.min`] = String(r.min);
      t[`${f.key}.max`] = String(r.max);
    } else t[f.key] = String(val ?? '');
  }
  return t;
}

export function fromText(
  fields: Field[],
  t: Text,
): { values: Values; errors: Record<string, string> } {
  const values: Values = {};
  const errors: Record<string, string> = {};
  const int = (key: string, s: string) => {
    if (!/^\d+$/.test(s.trim())) errors[key] = 'Enter a whole number';
    return Number(s);
  };
  for (const f of fields) {
    const s = t[f.key];
    if (f.kind === 'bool') values[f.key] = Boolean(s);
    else if (f.kind === 'money') {
      const p = rupeesToPaise(String(s));
      if (p === null) errors[f.key] = 'Enter an amount like 499 or 49.50';
      values[f.key] = p ?? 0;
    } else if (f.kind === 'int') values[f.key] = int(f.key, String(s));
    else if (f.kind === 'list')
      values[f.key] = String(s)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    else if (f.kind === 'lines')
      values[f.key] = String(s)
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
    else if (f.kind === 'range')
      values[f.key] = {
        min: int(`${f.key}.min`, String(t[`${f.key}.min`])),
        max: int(`${f.key}.max`, String(t[`${f.key}.max`])),
      };
    else values[f.key] = String(s).trim();
  }
  return { values, errors };
}

export function SettingsForm({
  settingsKey,
  initial,
}: {
  settingsKey: SettingsKey;
  initial: Values;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const groups = SETTINGS_FORMS[settingsKey];
  const fields = groups.flatMap((g) => g.fields);
  const [t, setT] = useState<Text>(() => toText(fields, initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string | boolean) => setT((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setMessage(null);
    const { values, errors: conv } = fromText(fields, t);
    const body = { ...initial, ...values };
    const parsed = SETTINGS_SCHEMAS[settingsKey].safeParse(body);
    const errs = { ...conv };
    if (!parsed.success) for (const i of parsed.error.issues) errs[i.path.join('.')] ??= i.message;
    if (Object.keys(errs).length) {
      setErrors(errs);
      setMessage('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/admin/settings/${settingsKey}`, body);
      setErrors({});
      toast({ title: 'Settings saved', variant: 'success' });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setMessage(err.message);
      } else setMessage('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const control = (f: Field) => {
    const err = errors[f.key];
    switch (f.kind) {
      case 'bool':
        return (
          <Checkbox
            key={f.key}
            label={f.label}
            description={f.hint}
            checked={Boolean(t[f.key])}
            onChange={(e) => set(f.key, e.target.checked)}
          />
        );
      case 'state':
        return (
          <FormField key={f.key} label={f.label} hint={f.hint} error={err}>
            <Select
              name={f.key}
              value={String(t[f.key])}
              onChange={(e) => set(f.key, e.target.value)}
            >
              <option value="">Not set (invoices use IGST)</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </FormField>
        );
      case 'range':
        return (
          <fieldset key={f.key} className="flex flex-col gap-1.5">
            <legend className="text-small font-medium">{f.label} (business days)</legend>
            <div className="flex items-start gap-3">
              <FormField label="From" error={errors[`${f.key}.min`]} className="w-24">
                <Input
                  name={`${f.key}.min`}
                  value={String(t[`${f.key}.min`])}
                  inputMode="numeric"
                  onChange={(e) => set(`${f.key}.min`, e.target.value)}
                />
              </FormField>
              <FormField label="To" error={errors[`${f.key}.max`] ?? err} className="w-24">
                <Input
                  name={`${f.key}.max`}
                  value={String(t[`${f.key}.max`])}
                  inputMode="numeric"
                  onChange={(e) => set(`${f.key}.max`, e.target.value)}
                />
              </FormField>
            </div>
          </fieldset>
        );
      case 'textarea':
      case 'lines':
        return (
          <FormField
            key={f.key}
            label={f.label}
            hint={f.hint}
            error={err ?? Object.entries(errors).find(([k]) => k.startsWith(`${f.key}.`))?.[1]}
          >
            <Textarea
              name={f.key}
              value={String(t[f.key])}
              rows={f.kind === 'lines' ? 5 : 3}
              maxLength={'max' in f ? f.max : undefined}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </FormField>
        );
      default:
        return (
          <FormField
            key={f.key}
            label={f.label}
            hint={f.hint}
            error={err ?? Object.entries(errors).find(([k]) => k.startsWith(`${f.key}.`))?.[1]}
          >
            <Input
              name={f.key}
              value={String(t[f.key])}
              type={f.kind === 'email' ? 'email' : f.kind === 'tel' ? 'tel' : 'text'}
              inputMode={f.kind === 'money' ? 'decimal' : f.kind === 'int' ? 'numeric' : undefined}
              maxLength={'max' in f ? f.max : undefined}
              className={f.kind === 'money' || f.kind === 'int' ? 'max-w-48' : undefined}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </FormField>
        );
    }
  };

  return (
    <form
      noValidate
      className="flex max-w-3xl flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {message && <Alert variant="error">{message}</Alert>}
      {groups.map((g, gi) => (
        <section
          key={g.title}
          aria-labelledby={`g-${settingsKey}-${gi}`}
          className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:p-5"
        >
          <div>
            <h2 id={`g-${settingsKey}-${gi}`} className="text-h4">
              {g.title}
            </h2>
            {g.description && <p className="mt-1 text-small text-text-muted">{g.description}</p>}
          </div>
          {g.fields.map(control)}
        </section>
      ))}
      <div>
        <Button type="submit" loading={saving} loadingText="Saving…">
          Save settings
        </Button>
      </div>
    </form>
  );
}
