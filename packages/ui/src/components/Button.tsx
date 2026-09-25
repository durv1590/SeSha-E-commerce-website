import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '../lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant =
  'primary' | 'secondary' | 'accent' | 'outline' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-body text-button font-semibold rounded-button ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-standard ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 ' +
  '[&_svg]:shrink-0';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-text-inverse shadow-xs hover:bg-primary-dark',
  secondary: 'bg-navy text-text-inverse shadow-xs hover:bg-navy-light',
  // White on orange fails WCAG AA (2.4:1) — navy text keeps the brand look at 7.4:1.
  accent: 'bg-accent text-navy shadow-xs hover:bg-accent-dark',
  outline:
    'border border-border-strong bg-surface text-text-primary hover:border-primary hover:text-primary',
  ghost: 'text-text-primary hover:bg-surface-muted',
  danger: 'bg-error text-text-inverse shadow-xs hover:bg-error-text',
  // min-h-6 keeps even text-style buttons at the WCAG 2.2 minimum 24px target size.
  link: 'h-auto min-h-6 rounded-xs px-0 text-primary underline-offset-4 hover:underline',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-control-sm px-3 text-small',
  md: 'h-control-md px-5',
  lg: 'h-control-lg px-7 text-body',
  icon: 'size-control-md p-0',
  'icon-sm': 'size-control-sm p-0',
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Button classes, for elements that must look like a button (e.g. a Next.js <Link>). */
export function buttonVariants({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    base,
    variants[variant],
    variant !== 'link' && sizes[size],
    fullWidth && 'w-full',
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleOptions {
  /** Shows a spinner, keeps the width stable and blocks repeat submissions. */
  loading?: boolean;
  loadingText?: string;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant,
  size,
  fullWidth,
  className,
  loading = false,
  loadingText,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonVariants({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

export const ButtonPrimary = (props: Omit<ButtonProps, 'variant'>) => (
  <Button {...props} variant="primary" />
);
export const ButtonSecondary = (props: Omit<ButtonProps, 'variant'>) => (
  <Button {...props} variant="secondary" />
);
export const ButtonOutline = (props: Omit<ButtonProps, 'variant'>) => (
  <Button {...props} variant="outline" />
);
export const ButtonDanger = (props: Omit<ButtonProps, 'variant'>) => (
  <Button {...props} variant="danger" />
);
