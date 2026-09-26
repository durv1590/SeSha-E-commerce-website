import { describe, expect, it } from 'vitest';
import { describeUserAgent } from './user-agent';

describe('describeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari on iOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36 Edg/128.0',
      'Edge on Windows',
    ],
    [null, 'Unknown device'],
  ])('%s → %s', (ua, expected) => {
    expect(describeUserAgent(ua)).toBe(expected);
  });
});
