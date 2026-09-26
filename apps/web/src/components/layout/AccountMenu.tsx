'use client';

import type { MeDto } from '@seshakart/types';
import { DropdownMenu, buttonVariants, cn } from '@seshakart/ui';
import { ChevronDown, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, hasSession } from '@/lib/api/browser';
import { refreshCartState } from '@/lib/cart/store';

/**
 * Header account entry. Anonymous visitors see "Sign in" instantly (no request);
 * signed-in visitors see their first name and an account menu.
 */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<MeDto | null | undefined>(undefined);

  useEffect(() => {
    if (!hasSession()) {
      setUser(null);
      return;
    }
    api.get<MeDto>('/auth/me').then(setUser, () => setUser(null));
  }, []);

  if (!user) {
    return (
      <Link
        href="/login"
        className={cn(
          buttonVariants({ variant: 'ghost', size: compact ? 'icon' : 'md' }),
          'text-nav',
        )}
        aria-label={compact ? 'Sign in' : undefined}
      >
        <UserRound size={22} aria-hidden="true" />
        {!compact && <span>{user === undefined ? 'Account' : 'Sign in'}</span>}
      </Link>
    );
  }

  const firstName = user.name.split(' ')[0];
  return (
    <DropdownMenu
      align="end"
      triggerLabel={`Account menu for ${user.name}`}
      triggerClassName={cn(
        buttonVariants({ variant: 'ghost', size: compact ? 'icon' : 'md' }),
        'text-nav',
      )}
      trigger={
        <>
          <UserRound size={22} aria-hidden="true" />
          {!compact && (
            <>
              <span className="max-w-28 truncate">Hi, {firstName}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </>
          )}
        </>
      }
      items={[
        { label: 'My account', onSelect: () => router.push('/account') },
        { label: 'Profile', onSelect: () => router.push('/account/profile') },
        { label: 'Addresses', onSelect: () => router.push('/account/addresses') },
        { label: 'Notifications', onSelect: () => router.push('/account/notifications') },
        {
          label: 'Sign out',
          danger: true,
          onSelect: async () => {
            await api.post('/auth/logout').catch(() => undefined);
            refreshCartState();
            setUser(null);
            router.push('/');
            router.refresh();
          },
        },
      ]}
    />
  );
}
