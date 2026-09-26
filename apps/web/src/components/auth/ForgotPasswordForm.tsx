'use client';

import { Alert, Button, FormField, Input } from '@seshakart/ui';
import { forgotPasswordSchema, resetPasswordSchema } from '@seshakart/validation';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { useForm } from '@/lib/forms/use-form';
import { PasswordInput } from './PasswordInput';
import { ResendTimer } from './ResendTimer';

export function ForgotPasswordForm() {
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [notice, setNotice] = useState('');
  const request = useForm(forgotPasswordSchema, { identifier: '' });
  const reset = useForm(resetPasswordSchema, { identifier: '', code: '', password: '' });

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success" title="Password updated">
          For your security, you’ve been signed out on all devices.
        </Alert>
        <Link href="/login" className="text-center font-semibold">
          Sign in with your new password
        </Link>
      </div>
    );
  }

  if (step === 'request') {
    return (
      <form
        ref={request.formRef}
        noValidate
        onSubmit={request.handleSubmit(async () => {
          const res = await api.post<{ message: string }>('/auth/password/forgot', request.values);
          setNotice(res.message);
          reset.set('identifier', request.values.identifier);
          setStep('reset');
        })}
        className="flex flex-col gap-4"
      >
        {request.formError && <Alert variant="error">{request.formError}</Alert>}
        <FormField label="Email or mobile number" error={request.errors.identifier} required>
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
          Send reset code
        </Button>
      </form>
    );
  }

  return (
    <form
      ref={reset.formRef}
      noValidate
      onSubmit={reset.handleSubmit(async () => {
        await api.post('/auth/password/reset', reset.values);
        setStep('done');
      })}
      className="flex flex-col gap-4"
    >
      {!reset.formError && <Alert variant="info">{notice}</Alert>}
      {reset.formError && <Alert variant="error">{reset.formError}</Alert>}
      <FormField label="6-digit code" error={reset.errors.code} required>
        <Input
          {...reset.field('code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]*"
          className="text-center text-h4 tracking-[0.5em]"
        />
      </FormField>
      <FormField
        label="New password"
        hint="At least 8 characters, with a letter and a number"
        error={reset.errors.password}
        required
      >
        <PasswordInput {...reset.field('password')} autoComplete="new-password" />
      </FormField>
      <Button type="submit" size="lg" fullWidth loading={reset.submitting} loadingText="Updating…">
        Reset password
      </Button>
      <div className="text-center">
        <ResendTimer
          onResend={async () => {
            try {
              await api.post('/auth/password/forgot', { identifier: reset.values.identifier });
            } catch (err) {
              reset.setFormError((err as Error).message);
            }
          }}
        />
      </div>
    </form>
  );
}
