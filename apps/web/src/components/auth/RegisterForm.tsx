'use client';

import { Alert, Button, Checkbox, FormField, Input } from '@seshakart/ui';
import { registerSchema } from '@seshakart/validation';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/browser';
import { useForm } from '@/lib/forms/use-form';
import { PasswordInput } from './PasswordInput';

export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const form = useForm(registerSchema, {
    name: '',
    email: '',
    phone: '',
    password: '',
    marketingOptIn: false,
  });

  return (
    <form
      ref={form.formRef}
      noValidate
      onSubmit={form.handleSubmit(async () => {
        await api.post('/auth/register', form.values);
        router.replace(next);
        router.refresh();
      })}
      className="flex flex-col gap-4"
    >
      {form.formError && <Alert variant="error">{form.formError}</Alert>}
      <FormField label="Full name" error={form.errors.name} required>
        <Input {...form.field('name')} autoComplete="name" />
      </FormField>
      <FormField
        label="Email address"
        hint="Email or mobile — at least one is required"
        error={form.errors.email}
      >
        <Input
          {...form.field('email')}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
      </FormField>
      <FormField label="Mobile number" hint="10-digit Indian mobile" error={form.errors.phone}>
        <div className="flex">
          <span className="inline-flex items-center rounded-l-input border border-r-0 border-border-strong bg-surface-muted px-3 text-body text-text-secondary">
            +91
          </span>
          <Input
            {...form.field('phone')}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={14}
            className="rounded-l-none"
          />
        </div>
      </FormField>
      <FormField
        label="Create a password"
        hint="At least 8 characters, with a letter and a number"
        error={form.errors.password}
        required
      >
        <PasswordInput {...form.field('password')} autoComplete="new-password" />
      </FormField>
      <Checkbox
        label="Send me offers and new arrivals"
        description="You can unsubscribe at any time."
        checked={Boolean(form.values.marketingOptIn)}
        onChange={(e) => form.set('marketingOptIn', e.target.checked)}
      />
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={form.submitting}
        loadingText="Creating account…"
      >
        Create account
      </Button>
      <p className="text-center text-caption text-text-muted">
        By creating an account, you agree to SeShaKart’s Terms of Use and Privacy Policy.
      </p>
    </form>
  );
}
