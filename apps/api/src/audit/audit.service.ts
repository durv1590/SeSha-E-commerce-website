import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  /** Verb in `entity.action` form, e.g. "order.status_changed", "product.deleted". */
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

/** Append-only audit trail for sensitive and administrative actions. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an entry. Pass a transaction client to make the audit record commit
   * or roll back together with the change it describes.
   */
  async record(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    try {
      await tx.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          metadata: entry.metadata,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent?.slice(0, 300) ?? null,
        },
      });
    } catch (err) {
      if (tx !== this.prisma) throw err; // inside a transaction: fail the whole operation
      this.logger.error(`Failed to write audit log for ${entry.action}: ${(err as Error).message}`);
    }
  }
}
