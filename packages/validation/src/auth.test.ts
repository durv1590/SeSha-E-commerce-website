import { describe, expect, it } from 'vitest';
import { addressSchema, updateProfileSchema } from './account';
import { identifierSchema, loginSchema, newPasswordSchema, registerSchema } from './auth';

describe('identifierSchema', () => {
  it('detects and normalises emails and phones', () => {
    expect(identifierSchema.parse(' Asha@Example.com ')).toEqual({
      type: 'email',
      value: 'asha@example.com',
    });
    expect(identifierSchema.parse('+91 98765 43210')).toEqual({
      type: 'phone',
      value: '9876543210',
    });
  });
  it('rejects garbage with a helpful message', () => {
    const r = identifierSchema.safeParse('hello');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/email or 10-digit mobile/);
  });
});

describe('registerSchema', () => {
  it('requires an email or a phone', () => {
    const r = registerSchema.safeParse({ name: 'Asha', password: 'Smart2026x' });
    expect(r.success).toBe(false);
  });
  it('accepts phone-only registration and treats empty email as absent', () => {
    const r = registerSchema.parse({
      name: 'Asha',
      email: '',
      phone: '9876543210',
      password: 'Smart2026x',
    });
    expect(r).toMatchObject({ email: undefined, phone: '9876543210', marketingOptIn: false });
  });
  it('rejects common passwords', () => {
    expect(newPasswordSchema.safeParse('Password123').success).toBe(false);
    expect(newPasswordSchema.safeParse('Tulsi-garden-42').success).toBe(true);
  });
});

describe('loginSchema', () => {
  it('does not apply the new-password policy to existing passwords', () => {
    expect(loginSchema.safeParse({ identifier: 'a@b.co', password: 'short' }).success).toBe(true);
  });
});

describe('account schemas', () => {
  it('turns blank optional address lines into null', () => {
    const a = addressSchema.parse({
      name: 'Asha',
      phone: '9876543210',
      line1: '12 MG Road',
      line2: '  ',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    });
    expect(a).toMatchObject({ line2: null, label: 'HOME', isDefault: false });
  });
  it('rejects an empty profile update', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });
});
