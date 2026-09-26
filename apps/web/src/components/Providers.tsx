'use client';

import { ToastProvider } from '@seshakart/ui';
import type { ReactNode } from 'react';

/** Client-side providers for interactive sections (toasts). */
export function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
