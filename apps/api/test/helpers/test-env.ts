/**
 * Test environment. Integration tests run against a dedicated database
 * (never the development one) and, when available, a dedicated Redis DB.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://seshakart:seshakart@localhost:5432/seshakart_test?schema=public';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL; // e.g. redis://localhost:6379/15
