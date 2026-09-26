import { allowedOrigins, loadEnv } from './env';

const DB = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/seshakart_test',
  JWT_SECRET: 'j'.repeat(40),
  SESSION_SECRET: 's'.repeat(40),
};
const PROD = {
  ...DB,
  NODE_ENV: 'production',
  REDIS_URL: 'redis://r:6379',
  SMTP_HOST: 'smtp.example.com',
  SMS_PROVIDER: 'none',
  PAYMENT_PROVIDER: 'razorpay',
  PAYMENT_KEY_ID: 'rzp_live_x',
  PAYMENT_KEY_SECRET: 'secret',
  PAYMENT_WEBHOOK_SECRET: 'hook',
  WEB_INTERNAL_URL: 'http://web:3000',
  REVALIDATE_SECRET: 'r'.repeat(32),
};

describe('loadEnv', () => {
  it('applies safe defaults', () => {
    const env = loadEnv({ ...DB });
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('requires a PostgreSQL DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: 'mysql://u:p@h/db' })).toThrow(/postgresql/);
  });

  it('requires REDIS_URL in production only', () => {
    expect(() => loadEnv({ ...PROD, REDIS_URL: undefined })).toThrow(/REDIS_URL/);
    expect(loadEnv(PROD).REDIS_URL).toBe('redis://r:6379');
    expect(loadEnv({ ...DB, NODE_ENV: 'development' }).REDIS_URL).toBeUndefined();
  });

  it('enforces production-only safety rules', () => {
    expect(() => loadEnv({ ...PROD, SMTP_HOST: undefined })).toThrow(/SMTP_HOST/);
    expect(() => loadEnv({ ...PROD, SMS_PROVIDER: 'console' })).toThrow(/SMS_PROVIDER/);
    expect(() => loadEnv({ ...PROD, SESSION_SECRET: PROD.JWT_SECRET })).toThrow(/must differ/);
  });

  it('forbids the mock payment gateway in production and requires real credentials', () => {
    expect(() => loadEnv({ ...PROD, PAYMENT_PROVIDER: 'mock' })).toThrow(/PAYMENT_PROVIDER/);
    expect(() => loadEnv({ ...PROD, PAYMENT_WEBHOOK_SECRET: undefined })).toThrow(
      /PAYMENT_WEBHOOK_SECRET: is required for razorpay/,
    );
    expect(() => loadEnv({ ...DB, PAYMENT_PROVIDER: 'razorpay' })).toThrow(/PAYMENT_KEY_ID/);
    expect(loadEnv({ ...DB }).PAYMENT_PROVIDER).toBe('mock');
  });

  it('requires the storefront revalidation hook in production', () => {
    expect(() => loadEnv({ ...PROD, WEB_INTERNAL_URL: undefined })).toThrow(/WEB_INTERNAL_URL/);
    expect(() => loadEnv({ ...PROD, REVALIDATE_SECRET: undefined })).toThrow(/REVALIDATE_SECRET/);
    expect(() => loadEnv({ ...PROD, REVALIDATE_SECRET: 'short' })).toThrow(/REVALIDATE_SECRET/);
    expect(loadEnv({ ...DB }).WEB_INTERNAL_URL).toBeUndefined();
  });

  it('requires strong secrets', () => {
    expect(() => loadEnv({ ...DB, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects malformed values with a readable message', () => {
    expect(() => loadEnv({ ...DB, API_PORT: 'abc', APP_URL: 'not a url' })).toThrow(
      /API_PORT[\s\S]*APP_URL/,
    );
  });

  it('builds the CORS allow-list from APP_URL and CORS_ORIGINS', () => {
    const env = loadEnv({
      ...DB,
      APP_URL: 'https://www.seshakart.com/',
      CORS_ORIGINS: 'https://seshakart.com, https://www.seshakart.com',
    });
    expect(allowedOrigins(env)).toEqual(['https://www.seshakart.com', 'https://seshakart.com']);
  });
});
