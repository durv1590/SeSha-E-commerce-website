import { cn } from '../lib/cn';

export interface SpinnerProps {
  className?: string;
  /** Accessible label; omit when the spinner is decorative inside a labelled control. */
  label?: string;
}

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <svg
      className={cn('size-4 animate-spin motion-reduce:animate-none', className)}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
