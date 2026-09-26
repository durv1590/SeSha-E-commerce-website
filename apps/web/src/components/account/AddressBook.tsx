'use client';

import type { AddressDto } from '@seshakart/types';
import { INDIAN_STATES } from '@seshakart/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Modal,
  Radio,
  Select,
  useToast,
} from '@seshakart/ui';
import { addressSchema } from '@seshakart/validation';
import { MapPin, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { useForm } from '@/lib/forms/use-form';

const LABELS = { HOME: 'Home', WORK: 'Work', OTHER: 'Other' } as const;

export function AddressBook({ initial }: { initial: AddressDto[] }) {
  const { toast } = useToast();
  const [addresses, setAddresses] = useState(initial);
  const [editing, setEditing] = useState<AddressDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AddressDto | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => setAddresses(await api.get<AddressDto[]>('/users/me/addresses'));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1">Addresses</h1>
          <p className="mt-1 text-text-muted">Where should we deliver?</p>
        </div>
        {addresses.length > 0 && (
          <Button onClick={() => setEditing('new')}>
            <Plus size={18} aria-hidden="true" /> Add address
          </Button>
        )}
      </div>

      {addresses.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MapPin size={28} aria-hidden="true" />}
            title="No saved addresses yet"
            description="Save an address now for faster checkout later."
            action={<Button onClick={() => setEditing('new')}>Add your first address</Button>}
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{LABELS[a.label]}</Badge>
                  {a.isDefault && <Badge variant="info">Default</Badge>}
                </div>
                <address className="flex-1 text-small not-italic leading-relaxed text-text-secondary">
                  <strong className="block text-body text-text-primary">{a.name}</strong>
                  {a.line1}
                  {a.line2 && <>, {a.line2}</>}
                  <br />
                  {a.landmark && (
                    <>
                      Near {a.landmark}
                      <br />
                    </>
                  )}
                  {a.city}, {a.state} – {a.pincode}
                  <br />
                  Mobile: +91 {a.phone}
                </address>
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(a)}
                    aria-label={`Edit address for ${a.name}, ${a.line1}`}
                  >
                    Edit
                  </Button>
                  {!a.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await api.patch(`/users/me/addresses/${a.id}`, { isDefault: true });
                        await reload();
                        toast({ title: 'Default address updated', variant: 'success' });
                      }}
                    >
                      Make default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-error-text"
                    onClick={() => setDeleting(a)}
                    aria-label={`Delete address for ${a.name}, ${a.line1}`}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <AddressFormModal
          address={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
            toast({ title: 'Address saved', variant: 'success' });
          }}
        />
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this address?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.delete(`/users/me/addresses/${deleting!.id}`);
                  setDeleting(null);
                  await reload();
                  toast({ title: 'Address deleted' });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        {deleting && (
          <p className="text-small text-text-secondary">
            {deleting.name}, {deleting.line1}, {deleting.city} – {deleting.pincode}
          </p>
        )}
      </Modal>
    </div>
  );
}

function AddressFormModal({
  address,
  onClose,
  onSaved,
}: {
  address: AddressDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm(addressSchema, {
    label: address?.label ?? 'HOME',
    name: address?.name ?? '',
    phone: address?.phone ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    landmark: address?.landmark ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    pincode: address?.pincode ?? '',
    isDefault: address?.isDefault ?? false,
  });
  const formId = 'address-form';

  return (
    <Modal
      open
      onClose={onClose}
      title={address ? 'Edit address' : 'Add a new address'}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={form.submitting} loadingText="Saving…">
            Save address
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        ref={form.formRef}
        noValidate
        onSubmit={form.handleSubmit(async (data) => {
          if (address) await api.patch(`/users/me/addresses/${address.id}`, data);
          else await api.post('/users/me/addresses', data);
          onSaved();
        })}
        className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2"
      >
        {form.formError && (
          <Alert variant="error" className="sm:col-span-2">
            {form.formError}
          </Alert>
        )}
        <FormField label="Full name" error={form.errors.name} required>
          <Input {...form.field('name')} autoComplete="shipping name" />
        </FormField>
        <FormField
          label="Mobile number"
          hint="For delivery updates"
          error={form.errors.phone}
          required
        >
          <Input
            {...form.field('phone')}
            type="tel"
            inputMode="numeric"
            autoComplete="shipping tel-national"
            maxLength={14}
          />
        </FormField>
        <FormField
          label="House no., building, street"
          error={form.errors.line1}
          required
          className="sm:col-span-2"
        >
          <Input {...form.field('line1')} autoComplete="shipping address-line1" />
        </FormField>
        <FormField
          label="Area, colony, sector"
          hint="Optional"
          error={form.errors.line2}
          className="sm:col-span-2"
        >
          <Input {...form.field('line2')} autoComplete="shipping address-line2" />
        </FormField>
        <FormField label="Landmark" hint="Optional" error={form.errors.landmark}>
          <Input {...form.field('landmark')} />
        </FormField>
        <FormField label="PIN code" error={form.errors.pincode} required>
          <Input
            {...form.field('pincode')}
            inputMode="numeric"
            maxLength={6}
            autoComplete="shipping postal-code"
          />
        </FormField>
        <FormField label="City / town" error={form.errors.city} required>
          <Input {...form.field('city')} autoComplete="shipping address-level2" />
        </FormField>
        <FormField label="State" error={form.errors.state} required>
          <Select {...form.field('state')} autoComplete="shipping address-level1">
            <option value="" disabled>
              Select state
            </option>
            {INDIAN_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FormField>
        <fieldset className="sm:col-span-2">
          <legend className="text-small font-medium">Address type</legend>
          <div className="flex flex-wrap gap-x-6">
            {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((l) => (
              <Radio
                key={l}
                name="label"
                label={LABELS[l]}
                checked={form.values.label === l}
                onChange={() => form.set('label', l)}
              />
            ))}
          </div>
        </fieldset>
        {!address?.isDefault && (
          <Checkbox
            className="sm:col-span-2"
            label="Make this my default address"
            checked={Boolean(form.values.isDefault)}
            onChange={(e) => form.set('isDefault', e.target.checked)}
          />
        )}
      </form>
    </Modal>
  );
}
