import { TEST_DATABASE_URL } from './helpers/test-env';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
delete process.env.REDIS_URL; // opt in per test via TEST_REDIS_URL
process.env.LOG_LEVEL = 'error';
