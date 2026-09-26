'use client';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import type { z, ZodTypeAny } from 'zod';
import { ApiError } from '../api/errors';

type Values = Record<string, unknown>;

/**
 * Minimal form state for Zod schemas shared with the API.
 * - Validates on submit with the same rules the server enforces.
 * - Maps server field errors (422 details) back onto fields.
 * - Moves focus to the first invalid field (accessibility).
 */
export function useForm<S extends ZodTypeAny, V extends Values>(schema: S, initial: V) {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const set = useCallback(<K extends keyof V>(name: K, value: V[K]) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name as string] ? { ...e, [name as string]: '' } : e));
  }, []);

  /** Props for a text input bound to `name`. */
  const field = (name: keyof V & string) => ({
    name,
    value: (values[name] as string | undefined) ?? '',
    onChange: (e: { target: { value: string } }) => set(name, e.target.value as V[typeof name]),
  });

  const focusFirstError = (errs: Record<string, string>) => {
    const first = Object.keys(errs).find((k) => errs[k]);
    if (first)
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(),
      );
  };

  const handleSubmit =
    (onValid: (data: z.output<S>) => Promise<void> | void) => async (e: FormEvent) => {
      e.preventDefault();
      setFormError(null);
      const parsed = schema.safeParse(values);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? '_form');
          errs[key] ??= issue.message;
        }
        if (errs._form) setFormError(errs._form);
        setErrors(errs);
        focusFirstError(errs);
        return;
      }
      setSubmitting(true);
      try {
        await onValid(parsed.data);
      } catch (err) {
        if (err instanceof ApiError) {
          const fieldErrs = err.fieldErrors();
          if (Object.keys(fieldErrs).length) {
            setErrors(fieldErrs);
            focusFirstError(fieldErrs);
          }
          setFormError(err.message);
        } else {
          setFormError('Something went wrong. Please try again.');
        }
      } finally {
        setSubmitting(false);
      }
    };

  return {
    values,
    set,
    field,
    errors,
    setErrors,
    formError,
    setFormError,
    submitting,
    handleSubmit,
    formRef,
  };
}
