import { SETTINGS_SCHEMAS } from '@seshakart/validation';
import { describe, expect, it } from 'vitest';
import { SETTINGS_FORMS, fromText, toText } from './SettingsForm';

describe('settings form conversion', () => {
  it('round-trips every settings group through the form text', () => {
    for (const key of ['store', 'commerce', 'shipping', 'search'] as const) {
      const defaults = SETTINGS_SCHEMAS[key].parse({}) as Record<string, unknown>;
      const fields = SETTINGS_FORMS[key].flatMap((g) => g.fields);
      const { values, errors } = fromText(fields, toText(fields, defaults));
      expect(errors).toEqual({});
      expect({ ...defaults, ...values }).toEqual(defaults);
      // Every stored field is editable.
      expect(fields.map((f) => f.key).sort()).toEqual(Object.keys(defaults).sort());
    }
  });

  it('reports bad numbers and amounts against the field', () => {
    const fields = SETTINGS_FORMS.shipping.flatMap((g) => g.fields);
    const text = toText(fields, SETTINGS_SCHEMAS.shipping.parse({}) as Record<string, unknown>);
    text['standardDays.min'] = 'three';
    text.remoteExtraDays = '-1';
    expect(Object.keys(fromText(fields, text).errors).sort()).toEqual([
      'remoteExtraDays',
      'standardDays.min',
    ]);
  });
});
