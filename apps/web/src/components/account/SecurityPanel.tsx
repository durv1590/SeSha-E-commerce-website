'use client';

import type { MeDto, SessionDto } from '@seshakart/types';
import { Alert, Badge, Button, Card, FormField, useToast } from '@seshakart/ui';
import { changePasswordSchema } from '@seshakart/validation';
import { Monitor, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { useForm } from '@/lib/forms/use-form';
import { describeUserAgent } from '@/lib/user-agent';
import { PasswordInput } from '../auth/PasswordInput';
import { refreshCartState } from '@/lib/cart/store';

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function SecurityPanel({
  user,
  sessions: initial,
}: {
  user: MeDto;
  sessions: SessionDto[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [sessions, setSessions] = useState(initial);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const form = useForm(changePasswordSchema, { currentPassword: '', newPassword: '' });

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="pw-heading" className="flex flex-col gap-4">
        <h2 id="pw-heading" className="text-h3">
          {user.hasPassword ? 'Change password' : 'Set a password'}
        </h2>
        <form
          ref={form.formRef}
          noValidate
          onSubmit={form.handleSubmit(async () => {
            await api.post('/users/me/password', form.values);
            form.set('currentPassword', '');
            form.set('newPassword', '');
            toast({
              title: 'Password updated',
              description: 'Other devices have been signed out.',
              variant: 'success',
            });
            setSessions(await api.get<SessionDto[]>('/users/me/sessions'));
          })}
          className="flex max-w-md flex-col gap-4"
        >
          {form.formError && <Alert variant="error">{form.formError}</Alert>}
          {user.hasPassword && (
            <FormField label="Current password" error={form.errors.currentPassword} required>
              <PasswordInput {...form.field('currentPassword')} autoComplete="current-password" />
            </FormField>
          )}
          <FormField
            label="New password"
            hint="At least 8 characters, with a letter and a number"
            error={form.errors.newPassword}
            required
          >
            <PasswordInput {...form.field('newPassword')} autoComplete="new-password" />
          </FormField>
          <Button
            type="submit"
            className="self-start"
            loading={form.submitting}
            loadingText="Updating…"
          >
            Update password
          </Button>
        </form>
      </section>

      <section aria-labelledby="devices-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="devices-heading" className="text-h3">
              Signed-in devices
            </h2>
            <p className="text-small text-text-muted">
              Don’t recognise a device? Sign it out and change your password.
            </p>
          </div>
          <Button
            variant="outline"
            loading={signingOutAll}
            onClick={async () => {
              setSigningOutAll(true);
              try {
                await api.post('/auth/logout-all');
                refreshCartState();
                router.push('/login');
                router.refresh();
              } finally {
                setSigningOutAll(false);
              }
            }}
          >
            Sign out everywhere
          </Button>
        </div>
        <ul className="flex flex-col gap-3">
          {sessions.map((s) => {
            const device = describeUserAgent(s.userAgent);
            const Icon = /Android|iOS|app/.test(device) ? Smartphone : Monitor;
            return (
              <li key={s.id}>
                <Card padding="sm" className="flex items-center gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-muted text-text-secondary">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {device} {s.current && <Badge variant="success">This device</Badge>}
                    </p>
                    <p className="text-caption text-text-muted">
                      Last active {dateTime.format(new Date(s.lastUsedAt))}
                      {s.ip ? ` · IP ${s.ip}` : ''}
                    </p>
                  </div>
                  {!s.current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-error-text"
                      aria-label={`Sign out ${device}`}
                      onClick={async () => {
                        await api.delete(`/users/me/sessions/${s.id}`);
                        setSessions((all) => all.filter((x) => x.id !== s.id));
                        toast({ title: 'Device signed out' });
                      }}
                    >
                      Sign out
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
