import type { Role } from '@prisma/client';

/** The authenticated principal attached to a request by AuthGuard. */
export interface AuthContext {
  userId: string;
  role: Role;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by AuthGuard when the request carries a valid access token. */
      auth?: AuthContext;
    }
  }
}

/** Native apps opt into body tokens with this header; browsers always get cookies. */
export const CLIENT_TYPE_HEADER = 'x-client-type';
