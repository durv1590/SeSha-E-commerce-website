import { allowedOrigins, loadEnv } from './env';

const DB = { DATABASE_URL: 'postgresql://u:p@localhost:5432/seshakart_test' };

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
    expect(() => loadEnv({ ...DB, NODE_ENV: 'production' })).toThrow(/REDIS_URL/);
    expect(loadEnv({ ...DB, NODE_ENV: 'production', REDIS_URL: 'redis://r:6379' }).REDIS_URL).toBe(
      'redis://r:6379',
    );
    expect(loadEnv({ ...DB, NODE_ENV: 'development' }).REDIS_URL).toBeUndefined();
  });

  it('rejects malformed values with a readable message', () => {
    expect(() => loadEnv({ API_PORT: 'abc', APP_URL: 'not a url' })).toThrow(
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
