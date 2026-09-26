import Redis from 'ioredis';
import type { Env } from '../config/env';
import { RedisService } from '../redis/redis.service';
import { CacheService } from './cache.service';

const TEST_REDIS_URL = process.env.TEST_REDIS_URL;

function makeCache(redisUrl?: string) {
  const redis = new RedisService({ REDIS_URL: redisUrl } as Env);
  return { redis, cache: new CacheService(redis) };
}

describe.each([
  ['in-memory', undefined],
  ['redis', TEST_REDIS_URL],
] as const)('CacheService (%s)', (label, url) => {
  const run = label === 'redis' && !url ? describe.skip : describe;
  run('behaviour', () => {
    let ctx: ReturnType<typeof makeCache>;

    beforeAll(async () => {
      if (url) {
        const r = new Redis(url);
        await r.flushdb();
        await r.quit();
      }
      ctx = makeCache(url);
      await ctx.redis.onModuleInit();
    });
    afterAll(() => ctx.redis.onModuleDestroy());

    it('wraps a loader and serves later calls from cache', async () => {
      const load = jest.fn().mockResolvedValue({ tree: [1, 2, 3] });
      expect(await ctx.cache.wrap('catalog:tree', 60, load)).toEqual({ tree: [1, 2, 3] });
      expect(await ctx.cache.wrap('catalog:tree', 60, load)).toEqual({ tree: [1, 2, 3] });
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('coalesces concurrent loads of the same key', async () => {
      const load = jest.fn(() => new Promise((r) => setTimeout(() => r('v'), 20)));
      await Promise.all([1, 2, 3, 4].map(() => ctx.cache.wrap('catalog:slow', 60, load)));
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('invalidates by prefix only', async () => {
      await ctx.cache.set('catalog:a', 1, 60);
      await ctx.cache.set('catalog:b', 2, 60);
      await ctx.cache.set('home:page', 3, 60);
      await ctx.cache.delByPrefix('catalog:');
      expect(await ctx.cache.get('catalog:a')).toBeUndefined();
      expect(await ctx.cache.get('catalog:b')).toBeUndefined();
      expect(await ctx.cache.get('home:page')).toBe(3);
    });

    it('keeps hot values parsed in-process, frozen, and drops them on invalidation', async () => {
      type Tree = { roots: { slug: string; children: unknown[] }[] };
      const load = jest.fn<Promise<Tree>, []>().mockResolvedValue({
        roots: [{ slug: 'audio', children: [] }],
      });
      const a = await ctx.cache.wrap('catalog:hot', 60, load, { localSeconds: 10 });
      const b = await ctx.cache.wrap('catalog:hot', 60, load, { localSeconds: 10 });
      expect(b).toBe(a); // same parsed object: no Redis round trip or JSON.parse
      expect(Object.isFrozen(a.roots[0])).toBe(true);
      expect(() => (a.roots as unknown[]).push(1)).toThrow(TypeError);

      await ctx.cache.delByPrefix('catalog:');
      load.mockResolvedValue({ roots: [] });
      expect(await ctx.cache.wrap('catalog:hot', 60, load, { localSeconds: 10 })).toEqual({
        roots: [],
      });
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('re-reads the shared cache once the local copy expires', async () => {
      const load = jest.fn().mockResolvedValue('v1');
      await ctx.cache.wrap('catalog:brief', 60, load, { localSeconds: 1 });
      await ctx.cache.set('catalog:brief', 'v2', 60); // e.g. written by another instance
      expect(await ctx.cache.wrap('catalog:brief', 60, load, { localSeconds: 1 })).toBe('v1');
      await new Promise((r) => setTimeout(r, 1100));
      expect(await ctx.cache.wrap('catalog:brief', 60, load, { localSeconds: 1 })).toBe('v2');
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('expires entries after their TTL', async () => {
      await ctx.cache.set('short', 'x', 1);
      await new Promise((r) => setTimeout(r, 1100));
      expect(await ctx.cache.get('short')).toBeUndefined();
    });
  });
});
