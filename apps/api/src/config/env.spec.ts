import { allowedOrigins, loadEnv } from './env';

describe('loadEnv', () => {
  it('applies safe defaults', () => {
    const env = loadEnv({});
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('rejects malformed values with a readable message', () => {
    expect(() => loadEnv({ API_PORT: 'abc', APP_URL: 'not a url' })).toThrow(
      /API_PORT[\s\S]*APP_URL/,
    );
  });

  it('builds the CORS allow-list from APP_URL and CORS_ORIGINS', () => {
    const env = loadEnv({
      APP_URL: 'https://www.seshakart.com/',
      CORS_ORIGINS: 'https://seshakart.com, https://www.seshakart.com',
    });
    expect(allowedOrigins(env)).toEqual(['https://www.seshakart.com', 'https://seshakart.com']);
  });
});
