import { TEST_DATABASE_URL } from './helpers/test-env';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
delete process.env.REDIS_URL; // opt in per test via TEST_REDIS_URL
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters';
process.env.SESSION_SECRET = 'test-session-secret-that-is-at-least-32-chars';
process.env.SMS_PROVIDER = 'console';
delete process.env.SMTP_HOST;
process.env.RATE_LIMIT_ENABLED = 'false'; // rate-limit.spec.ts re-enables it explicitly
