import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

const alertStyles: Record<AlertVariant, string> = {
  info: 'border-primary/30 bg-primary-light text-primary-dark',
  success: 'border-success/40 bg-success-light text-success-text',
  warning: 'border-warning/50 bg-warning-light text-warning-text',
  error: 'border-error/30 bg-error-light text-error-text',
};

const alertIcons: Record<AlertVariant, string> = {
  info: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 12H9V9h2v5zm0-7H9V5h2v2z',
  success:
    'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-1.2 11.6L5 9.8l1.4-1.4 2.4 2.4 4.8-4.8L15 7.4l-6.2 6.2z',
  warning: 'M10 2 1 18h18L10 2zm1 13H9v-2h2v2zm0-4H9V7h2v4z',
  error: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 12H9v-2h2v2zm0-4H9V5h2v5z',
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Inline message. Errors and warnings are announced immediately (role="alert"). */
export function Alert({ variant = 'info', title, children, action, className }: AlertProps) {
  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-md border p-3.5 text-small',
        alertStyles[variant],
        className,
      )}
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="mt-0.5 size-5 shrink-0"
        aria-hidden="true"
      >
        <path d={alertIcons[variant]} />
      </svg>
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Always offer a useful next step (e.g. "Continue shopping"). */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div
          className="mb-1 grid size-16 place-items-center rounded-pill bg-primary-light text-primary"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h2 className="font-heading text-h3 text-text-primary">{title}</h2>
      {description && <p className="text-body text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
