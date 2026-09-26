'use client';

import type { MeDto, UserDto } from '@seshakart/types';
import { Alert, Badge, Button, Checkbox, FormField, Input, Modal, useToast } from '@seshakart/ui';
import { otpCodeSchema, updateProfileSchema } from '@seshakart/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { api } from '@/lib/api/browser';
import { useForm } from '@/lib/forms/use-form';

export function ProfileForm({ user }: { user: MeDto }) {
  const router = useRouter();
  const { toast } = useToast();
  const form = useForm(updateProfileSchema, {
    name: user.name,
    email: user.email ?? '',
    phone: user.phone ?? '',
    marketingOptIn: user.marketingOptIn,
  });
  const [verifying, setVerifying] = useState<null | 'EMAIL' | 'SMS'>(null);

  return (
    <>
      <form
        ref={form.formRef}
        noValidate
        onSubmit={form.handleSubmit(async () => {
          await api.patch<UserDto>('/users/me', form.values);
          toast({ title: 'Profile saved', variant: 'success' });
          router.refresh();
        })}
        className="flex max-w-xl flex-col gap-5"
      >
        {form.formError && <Alert variant="error">{form.formError}</Alert>}
        <FormField label="Full name" error={form.errors.name} required>
          <Input {...form.field('name')} autoComplete="name" />
        </FormField>
        <FormField
          label={
            <span className="inline-flex items-center gap-2">
              Email address{' '}
              <VerifiedBadge verified={user.emailVerified} show={Boolean(user.email)} />
            </span>
          }
          hint="Changing your email means verifying it again"
          error={form.errors.email}
        >
          <Input {...form.field('email')} type="email" autoComplete="email" autoCapitalize="none" />
        </FormField>
        {user.email && !user.emailVerified && (
          <Button variant="link" className="-mt-3 self-start" onClick={() => setVerifying('EMAIL')}>
            Verify {user.email}
          </Button>
        )}
        <FormField
          label={
            <span className="inline-flex items-center gap-2">
              Mobile number{' '}
              <VerifiedBadge verified={user.phoneVerified} show={Boolean(user.phone)} />
            </span>
          }
          error={form.errors.phone}
        >
          <Input
            {...form.field('phone')}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={14}
          />
        </FormField>
        {user.phone && !user.phoneVerified && (
          <Button variant="link" className="-mt-3 self-start" onClick={() => setVerifying('SMS')}>
            Verify +91 {user.phone}
          </Button>
        )}
        <Checkbox
          label="Email me offers and new arrivals"
          checked={Boolean(form.values.marketingOptIn)}
          onChange={(e) => form.set('marketingOptIn', e.target.checked)}
        />
        <Button
          type="submit"
          className="self-start"
          loading={form.submitting}
          loadingText="Saving…"
        >
          Save changes
        </Button>
      </form>
      {verifying && (
        <VerifyContactModal
          channel={verifying}
          target={verifying === 'EMAIL' ? user.email! : `+91 ${user.phone}`}
          onClose={() => setVerifying(null)}
          onVerified={() => {
            setVerifying(null);
            toast({ title: 'Verified', variant: 'success' });
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function VerifiedBadge({ verified, show }: { verified: boolean; show: boolean }) {
  if (!show) return null;
  return verified ? (
    <Badge variant="success">Verified</Badge>
  ) : (
    <Badge variant="warning">Not verified</Badge>
  );
}

const codeSchema = z.object({ code: otpCodeSchema });

function VerifyContactModal({
  channel,
  target,
  onClose,
  onVerified,
}: {
  channel: 'EMAIL' | 'SMS';
  target: string;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const form = useForm(codeSchema, { code: '' });

  const send = async () => {
    setSending(true);
    setSendError(null);
    try {
      await api.post('/users/me/verify/request', { channel });
      setSent(true);
    } catch (err) {
      setSendError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={channel === 'EMAIL' ? 'Verify your email' : 'Verify your mobile'}
      size="sm"
    >
      {!sent ? (
        <div className="flex flex-col gap-4">
          {sendError && <Alert variant="error">{sendError}</Alert>}
          <p className="text-small text-text-secondary">
            We’ll send a 6-digit code to <strong>{target}</strong>.
          </p>
          <Button onClick={send} loading={sending} loadingText="Sending…">
            Send code
          </Button>
        </div>
      ) : (
        <form
          ref={form.formRef}
          noValidate
          onSubmit={form.handleSubmit(async (data) => {
            await api.post('/users/me/verify/confirm', { channel, code: data.code });
            onVerified();
          })}
          className="flex flex-col gap-4"
        >
          {form.formError && <Alert variant="error">{form.formError}</Alert>}
          <FormField label={`Code sent to ${target}`} error={form.errors.code} required>
            <Input
              {...form.field('code')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="text-center text-h4 tracking-[0.5em]"
            />
          </FormField>
          <Button type="submit" loading={form.submitting} loadingText="Verifying…">
            Verify
          </Button>
        </form>
      )}
    </Modal>
  );
}
