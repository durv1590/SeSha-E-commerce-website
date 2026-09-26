import type { ReactNode } from 'react';
import { Logo } from '../brand/Logo';

/** Centered card used by sign-in, registration and password reset. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="container-page flex justify-center py-section-sm">
      <div className="w-full max-w-narrow">
        <div className="rounded-card border border-border bg-surface p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Logo variant="icon" height={44} />
            <h1 className="text-h2">{title}</h1>
            {subtitle && <p className="text-small text-text-muted">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && <div className="mt-5 text-center text-small text-text-secondary">{footer}</div>}
      </div>
    </div>
  );
}
