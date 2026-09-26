import type { Request } from 'express';
import type { AuthContext } from '../auth/auth.types';

/** Who performed a staff action, for the audit log. */
export interface Actor {
  userId: string;
  ip?: string;
  userAgent?: string;
}

export function actorOf(auth: AuthContext, req: Request): Actor {
  return { userId: auth.userId, ip: req.ip, userAgent: req.header('user-agent') ?? undefined };
}
