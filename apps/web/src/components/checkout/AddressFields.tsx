'use client';

import { INDIAN_STATES } from '@seshakart/types';
import { FormField, Input, Select } from '@seshakart/ui';

export interface AddressValues {
  name: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
}

export const EMPTY_ADDRESS: AddressValues = {
  name: '',
  phone: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
};

/**
 * Controlled Indian address fields with browser autofill hints. `section` scopes
 * autofill ("shipping" / "billing") and prefixes field names so two sets can live
 * on one page.
 */
export function AddressFields({
  values,
  errors,
  onChange,
  section,
}: {
  values: AddressValues;
  errors: Partial<Record<keyof AddressValues, string>>;
  onChange: (name: keyof AddressValues, value: string) => void;
  section: 'shipping' | 'billing';
}) {
  const bind = (name: keyof AddressValues) => ({
    name: `${section}.${name}`,
    value: values[name],
    onChange: (e: { target: { value: string } }) => onChange(name, e.target.value),
  });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
      <FormField label="Full name" error={errors.name} required>
        <Input {...bind('name')} autoComplete={`${section} name`} />
      </FormField>
      <FormField label="Mobile number" hint="For delivery updates" error={errors.phone} required>
        <Input
          {...bind('phone')}
          type="tel"
          inputMode="numeric"
          autoComplete={`${section} tel-national`}
          maxLength={14}
        />
      </FormField>
      <FormField
        label="House no., building, street"
        error={errors.line1}
        required
        className="sm:col-span-2"
      >
        <Input {...bind('line1')} autoComplete={`${section} address-line1`} />
      </FormField>
      <FormField
        label="Area, colony, sector"
        hint="Optional"
        error={errors.line2}
        className="sm:col-span-2"
      >
        <Input {...bind('line2')} autoComplete={`${section} address-line2`} />
      </FormField>
      <FormField label="Landmark" hint="Optional" error={errors.landmark}>
        <Input {...bind('landmark')} />
      </FormField>
      <FormField label="PIN code" error={errors.pincode} required>
        <Input
          {...bind('pincode')}
          inputMode="numeric"
          maxLength={6}
          autoComplete={`${section} postal-code`}
        />
      </FormField>
      <FormField label="City / town" error={errors.city} required>
        <Input {...bind('city')} autoComplete={`${section} address-level2`} />
      </FormField>
      <FormField label="State" error={errors.state} required>
        <Select {...bind('state')} autoComplete={`${section} address-level1`}>
          <option value="" disabled>
            Select state
          </option>
          {INDIAN_STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </FormField>
    </div>
  );
}
