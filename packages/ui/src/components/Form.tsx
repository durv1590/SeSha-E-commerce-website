'use client';

import {
  createContext,
  useContext,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';

interface FieldContext {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required?: boolean;
}

const FieldCtx = createContext<FieldContext | null>(null);

/** Connects a control to its label, hint and error inside a <FormField>. */
function useField(props: {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: unknown;
  required?: boolean;
}) {
  const ctx = useContext(FieldCtx);
  return {
    id: props.id ?? ctx?.id,
    'aria-describedby': cn(props['aria-describedby'], ctx?.describedBy) || undefined,
    'aria-invalid': (props['aria-invalid'] as boolean | undefined) ?? (ctx?.invalid || undefined),
    required: props.required ?? ctx?.required,
  };
}

const controlBase =
  'w-full rounded-input border border-border-strong bg-surface font-body text-body text-text-primary ' +
  'placeholder:text-text-muted transition-[border-color,box-shadow] duration-fast ' +
  'hover:border-text-muted focus:border-primary focus:shadow-focus focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 ' +
  'aria-[invalid=true]:border-error aria-[invalid=true]:focus:shadow-[0_0_0_3px_rgb(var(--color-error)/0.25)]';

const controlSizes = {
  sm: 'h-control-sm px-3 text-small',
  md: 'h-control-md px-3.5',
  lg: 'h-control-lg px-4',
};

export function Label({ className, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('text-small font-medium text-text-primary', className)} {...rest}>
      {children}
    </label>
  );
}

export interface FormFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Hide the label visually but keep it for screen readers. */
  hideLabel?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  hint,
  error,
  required,
  hideLabel,
  id,
  className,
  children,
}: FormFieldProps) {
  const auto = useId();
  const fieldId = id ?? `field-${auto}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <FieldCtx.Provider
      value={{
        id: fieldId,
        describedBy: cn(hintId, errorId) || undefined,
        invalid: Boolean(error),
        required,
      }}
    >
      <div className={cn('flex flex-col gap-1.5', className)}>
        <Label htmlFor={fieldId} className={hideLabel ? 'sr-only' : undefined}>
          {label}
          {required && (
            <span className="text-error-text" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </Label>
        {children}
        {hint && !error && (
          <p id={hintId} className="text-caption text-text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-caption font-medium text-error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </FieldCtx.Provider>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: keyof typeof controlSizes;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, size = 'md', ...rest }: InputProps) {
  const field = useField(rest);
  return <input className={cn(controlBase, controlSizes[size], className)} {...rest} {...field} />;
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, rows = 4, ...rest }: TextareaProps) {
  const field = useField(rest);
  return (
    <textarea
      rows={rows}
      className={cn(controlBase, 'min-h-24 px-3.5 py-2.5', className)}
      {...rest}
      {...field}
    />
  );
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: keyof typeof controlSizes;
  ref?: Ref<HTMLSelectElement>;
}

/** Native select: best mobile UX, fully accessible, zero JavaScript. */
export function Select({ className, size = 'md', children, ...rest }: SelectProps) {
  const field = useField(rest);
  return (
    <div className="relative">
      <select
        className={cn(controlBase, controlSizes[size], 'appearance-none pr-10', className)}
        {...rest}
        {...field}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
      </svg>
    </div>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  type?: 'checkbox' | 'radio';
}

/** Checkbox or radio with a large (44px) touch area. */
export function Checkbox({
  label,
  description,
  className,
  id,
  type = 'checkbox',
  ...rest
}: CheckboxProps) {
  const auto = useId();
  const inputId = id ?? `check-${auto}`;
  const descId = description ? `${inputId}-desc` : undefined;
  return (
    <div className={cn('flex min-h-touch items-start gap-3 py-2', className)}>
      <input
        id={inputId}
        type={type}
        aria-describedby={descId}
        className={cn(
          'mt-0.5 size-5 shrink-0 cursor-pointer border-border-strong accent-primary',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        )}
        {...rest}
      />
      <div className="flex flex-col">
        <label htmlFor={inputId} className="cursor-pointer text-body text-text-primary">
          {label}
        </label>
        {description && (
          <span id={descId} className="text-small text-text-muted">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}

export const Radio = (props: Omit<CheckboxProps, 'type'>) => <Checkbox {...props} type="radio" />;
