import { Inject, Injectable } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/** Keys are "folder/name.ext" with safe characters only (no traversal, no hidden files). */
const SAFE_KEY = /^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9._-]*\.(?:webp|avif|png|jpe?g)$/;

export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..')) throw new Error(`Unsafe storage key: ${key}`);
}

/**
 * Media storage abstraction. The local driver writes to disk and the API serves
 * it at /api/media (behind the CDN in production). An S3-compatible driver is added
 * with admin uploads; callers only ever see keys and public URLs.
 */
@Injectable()
export class StorageService {
  readonly localDir: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    const packageRoot = join(__dirname, '..', '..');
    this.localDir = isAbsolute(env.MEDIA_LOCAL_DIR)
      ? env.MEDIA_LOCAL_DIR
      : resolve(packageRoot, env.MEDIA_LOCAL_DIR);
  }

  publicUrl(key: string): string {
    return `${this.env.MEDIA_PUBLIC_BASE.replace(/\/$/, '')}/${key}`;
  }

  private path(key: string): string {
    assertSafeKey(key);
    const full = normalize(join(this.localDir, key));
    if (!full.startsWith(this.localDir)) throw new Error(`Unsafe storage key: ${key}`);
    return full;
  }

  async put(key: string, body: Buffer): Promise<string> {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    return this.publicUrl(key);
  }

  async deletePrefix(prefix: string): Promise<void> {
    if (!/^[a-z0-9][a-z0-9_/-]*$/.test(prefix)) throw new Error(`Unsafe storage prefix: ${prefix}`);
    await rm(join(this.localDir, prefix), { recursive: true, force: true });
  }
}
