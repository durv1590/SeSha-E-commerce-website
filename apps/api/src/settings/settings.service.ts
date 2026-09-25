import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SETTINGS_SCHEMAS, type SettingsKey, type SettingsValue } from '@seshakart/validation';
import { AuditService } from '../audit/audit.service';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../database/prisma.service';

const TTL_SECONDS = 300;

/** Typed, validated, cached access to admin-editable settings. */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger('Settings');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  async get<K extends SettingsKey>(key: K): Promise<SettingsValue<K>> {
    return this.cache.wrap(`settings:${key}`, TTL_SECONDS, async () => {
      const row = await this.prisma.setting.findUnique({ where: { key } });
      const parsed = SETTINGS_SCHEMAS[key].safeParse(row?.value ?? {});
      if (!parsed.success) {
        // A corrupt row must never take checkout down: log loudly and use defaults.
        this.logger.error(`Invalid stored settings "${key}", falling back to defaults`);
        return SETTINGS_SCHEMAS[key].parse({}) as SettingsValue<K>;
      }
      return parsed.data as SettingsValue<K>;
    });
  }

  async update<K extends SettingsKey>(
    key: K,
    patch: Partial<SettingsValue<K>>,
    actorId: string | null,
  ): Promise<SettingsValue<K>> {
    const current = await this.get(key);
    const next = SETTINGS_SCHEMAS[key].parse({ ...current, ...patch }) as SettingsValue<K>;
    await this.prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key },
        create: { key, value: next as Prisma.InputJsonValue, updatedById: actorId },
        update: { value: next as Prisma.InputJsonValue, updatedById: actorId },
      });
      await this.audit.record(
        {
          actorId,
          action: 'settings.updated',
          entityType: 'setting',
          entityId: key,
          metadata: { before: current, after: next } as Prisma.InputJsonValue,
        },
        tx,
      );
    });
    await this.cache.del(`settings:${key}`);
    return next;
  }
}
