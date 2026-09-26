import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  indianMobileSchema,
  paginationSchema,
  passwordSchema,
  pincodeSchema,
  slugSchema,
} from './primitives';

describe('indianMobileSchema', () => {
  it.each(['9876543210', '+91 98765 43210', '09876543210', '91-9876543210'])('accepts %s', (v) => {
    expect(indianMobileSchema.parse(v)).toBe('9876543210');
  });
  it.each(['5876543210', '98765', '98765432101', 'abcdefghij'])('rejects %s', (v) => {
    expect(indianMobileSchema.safeParse(v).success).toBe(false);
  });
});

describe('pincodeSchema', () => {
  it('accepts valid PIN codes', () => {
    expect(pincodeSchema.parse(' 110001 ')).toBe('110001');
  });
  it.each(['011001', '11001', '1100011', 'ABCDEF'])('rejects %s', (v) => {
    expect(pincodeSchema.safeParse(v).success).toBe(false);
  });
});

describe('emailSchema', () => {
  it('normalises case and whitespace', () => {
    expect(emailSchema.parse('  Hello@SeShaKart.com ')).toBe('hello@seshakart.com');
  });
  it('rejects invalid email', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('requires a letter and a number', () => {
    expect(passwordSchema.safeParse('password').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
    expect(passwordSchema.safeParse('smart123').success).toBe(true);
  });
});

describe('slugSchema', () => {
  it('accepts kebab-case and rejects others', () => {
    expect(slugSchema.safeParse('mobile-phones').success).toBe(true);
    expect(slugSchema.safeParse('Mobile Phones').success).toBe(false);
    expect(slugSchema.safeParse('double--dash').success).toBe(false);
  });
});

describe('paginationSchema', () => {
  it('coerces query strings and applies defaults', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 24 });
    expect(paginationSchema.parse({ page: '3', pageSize: '12' })).toEqual({
      page: 3,
      pageSize: 12,
    });
  });
  it('caps page size', () => {
    expect(paginationSchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
