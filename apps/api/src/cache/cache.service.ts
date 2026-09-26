import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const MEMORY_MAX_ENTRIES = 5_000;

export interface WrapOptions {
  /**
   * Also keep the parsed value in this process for up to this many seconds. For small,
   * hot, shared values (category tree, brands, settings) read several times per request:
   * parsing them from Redis each time dominated API CPU under load. The value is
   * deep-frozen, because every caller shares one copy. `del`/`delByPrefix` clear it on
   * this instance at once; other instances may serve it for up to this long.
   */
  localSeconds?: number;
}

interface LocalEntry {
  value: unknown;
  expiresAt: number;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * JSON cache for read-heavy data (category tree, homepage, product listings).
 * Redis-backed in production; bounded in-memory fallback in development.
 *
 * Cache failures never break a request: on any Redis error the loader runs and
 * the result is returned uncached.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger('Cache');
  private readonly memory = new Map<string, MemoryEntry>();
  /** Parsed values of `localSeconds` keys (see WrapOptions). */
  private readonly local = new Map<string, LocalEntry>();
  /** Coalesces concurrent loads of the same key (cache-stampede protection). */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = this.redis.client
        ? await this.redis.client.get(`cache:${key}`)
        : this.memoryGet(key);
      return raw == null ? undefined : (JSON.parse(raw) as T);
    } catch (err) {
      this.logger.warn(`get ${key} failed: ${(err as Error).message}`);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const raw = JSON.stringify(value);
    try {
      if (this.redis.client) await this.redis.client.set(`cache:${key}`, raw, 'EX', ttlSeconds);
      else this.memorySet(key, raw, ttlSeconds);
    } catch (err) {
      this.logger.warn(`set ${key} failed: ${(err as Error).message}`);
    }
  }

  /** Returns the cached value, or runs `load`, caches and returns its result. */
  async wrap<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
    opts: WrapOptions = {},
  ): Promise<T> {
    const localSeconds = Math.min(opts.localSeconds ?? 0, ttlSeconds);
    if (localSeconds > 0) {
      const entry = this.local.get(key);
      if (entry && entry.expiresAt > Date.now()) return entry.value as T;
    }
    const keepLocal = (value: T): T => {
      if (localSeconds > 0)
        this.local.set(key, {
          value: deepFreeze(value),
          expiresAt: Date.now() + localSeconds * 1000,
        });
      return value;
    };

    const hit = await this.get<T>(key);
    if (hit !== undefined) return keepLocal(hit);

    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const promise = load()
      .then(async (value) => {
        await this.set(key, value, ttlSeconds);
        return keepLocal(value);
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  async del(key: string): Promise<void> {
    this.local.delete(key);
    try {
      if (this.redis.client) await this.redis.client.del(`cache:${key}`);
      else this.memory.delete(key);
    } catch (err) {
      this.logger.warn(`del ${key} failed: ${(err as Error).message}`);
    }
  }

  /** Invalidates every key starting with `prefix` (e.g. "catalog:" after an admin edit). */
  async delByPrefix(prefix: string): Promise<number> {
    for (const key of this.local.keys()) if (key.startsWith(prefix)) this.local.delete(key);
    if (!this.redis.client) {
      let n = 0;
      for (const key of this.memory.keys())
        if (key.startsWith(prefix) && this.memory.delete(key)) n++;
      return n;
    }
    // SCAN (never KEYS) so large keyspaces don't block Redis. SCAN ignores keyPrefix, so add it.
    const client = this.redis.client;
    const match = `${client.options.keyPrefix ?? ''}cache:${prefix}*`;
    let cursor = '0';
    let deleted = 0;
    try {
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', match, 'COUNT', 200);
        cursor = next;
        if (keys.length) {
          const strip = client.options.keyPrefix?.length ?? 0;
          deleted += await client.del(...keys.map((k) => k.slice(strip)));
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`delByPrefix ${prefix} failed: ${(err as Error).message}`);
    }
    return deleted;
  }

  private memoryGet(key: string): string | undefined {
    const entry = this.memory.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private memorySet(key: string, value: string, ttlSeconds: number): void {
    if (this.memory.size >= MEMORY_MAX_ENTRIES) {
      // Evict the oldest insertion (Map preserves insertion order).
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) this.memory.delete(oldest);
    }
    this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}
