'use client';

import { Alert, Button, FormField, Input } from '@seshakart/ui';
import { loginSchema, otpRequestSchema, otpVerifySchema } from '@seshakart/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { useForm } from '@/lib/forms/use-form';
import { PasswordInput } from './PasswordInput';
import { ResendTimer } from './ResendTimer';

type Mode = 'password' | 'otp';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');

  const onSignedIn = () => {
    router.replace(next);
    router.refresh();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="mb-5 grid grid-cols-2 rounded-button bg-surface-muted p-1"
      >
        {(
          [
            ['password', 'Password'],
            ['otp', 'One-time code'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-selected={mode === value}
            aria-controls={`panel-${value}`}
            onClick={() => setMode(value)}
            className="min-h-10 rounded-sm text-small font-semibold text-text-secondary transition-colors aria-selected:bg-surface aria-selected:text-primary aria-selected:shadow-xs"
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`}>
        {mode === 'password' ? (
          <PasswordLogin onSignedIn={onSignedIn} />
        ) : (
          <OtpLogin onSignedIn={onSignedIn} />
        )}
      </div>
    </div>
  );
}

function PasswordLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const form = useForm(loginSchema, { identifier: '', password: '' });
  return (
    <form
      ref={form.formRef}
      noValidate
      onSubmit={form.handleSubmit(async () => {
        await api.post('/auth/login', form.values);
        onSignedIn();
      })}
      className="flex flex-col gap-4"
    >
      {form.formError && <Alert variant="error">{form.formError}</Alert>}
      <FormField label="Email or mobile number" error={form.errors.identifier} required>
        <Input
          {...form.field('identifier')}
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
        />
      </FormField>
      <FormField label="Password" error={form.errors.password} required>
        <PasswordInput {...form.field('password')} autoComplete="current-password" />
      </FormField>
      <div className="-mt-2 text-right">
        <Link href="/forgot-password" className="text-small font-medium">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" fullWidth loading={form.submitting} loadingText="Signing in…">
        Sign in
      </Button>
    </form>
  );
}

function OtpLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const request = useForm(otpRequestSchema, { identifier: '' });
  const verify = useForm(otpVerifySchema, { identifier: '', code: '' });
  const [notice, setNotice] = useState<string | null>(null);

  if (!sentTo) {
    return (
      <form
        ref={request.formRef}
        noValidate
        onSubmit={request.handleSubmit(async (data) => {
          const res = await api.post<{ message: string }>('/auth/otp/request', {
            identifier: request.values.identifier,
          });
          setNotice(res.message);
          setSentTo(data.identifier.value);
          verify.set('identifier', request.values.identifier);
        })}
        className="flex flex-col gap-4"
      >
        {request.formError && <Alert variant="error">{request.formError}</Alert>}
        <FormField
          label="Email or mobile number"
          hint="We’ll send you a 6-digit code"
          error={request.errors.identifier}
          required
        >
          <Input
            {...request.field('identifier')}
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
          />
        </FormField>
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={request.submitting}
          loadingText="Sending code…"
        >
          Send code
        </Button>
      </form>
    );
  }

  return (
    <form
      ref={verify.formRef}
      noValidate
      onSubmit={verify.handleSubmit(async () => {
        await api.post('/auth/otp/verify', verify.values);
        onSignedIn();
      })}
      className="flex flex-col gap-4"
    >
      {notice && !verify.formError && <Alert variant="info">{notice}</Alert>}
      {verify.formError && <Alert variant="error">{verify.formError}</Alert>}
      <FormField label={`Code sent to ${sentTo}`} error={verify.errors.code} required>
        <Input
          {...verify.field('code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]*"
          className="text-center text-h4 tracking-[0.5em]"
        />
      </FormField>
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={verify.submitting}
        loadingText="Verifying…"
      >
        Verify and sign in
      </Button>
      <div className="flex items-center justify-between">
        <Button variant="link" onClick={() => setSentTo(null)}>
          Change email/mobile
        </Button>
        <ResendTimer
          onResend={async () => {
            try {
              await api.post('/auth/otp/request', { identifier: verify.values.identifier });
              verify.setFormError(null);
            } catch (err) {
              verify.setFormError((err as Error).message);
            }
          }}
        />
      </div>
    </form>
  );
}
