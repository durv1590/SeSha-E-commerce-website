import type { AddressDto } from '@seshakart/types';
import { Alert, Card } from '@seshakart/ui';
import { Bell, ChevronRight, MapPin, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import { serverApi } from '@/lib/api/server';
import { requireUser } from '@/lib/auth/session';

export const metadata = { title: 'Overview' };

export default async function AccountOverviewPage() {
  const user = await requireUser('/account');
  const [{ data: addresses }, notifications] = await Promise.all([
    serverApi<AddressDto[]>('/users/me/addresses'),
    serverApi<unknown[]>('/users/me/notifications?pageSize=1') as Promise<{
      data: unknown[];
      unread?: number;
    }>,
  ]);
  const unread = (notifications as { unread?: number }).unread ?? 0;
  const needsVerification =
    (user.email && !user.emailVerified) || (user.phone && !user.phoneVerified);

  const cards = [
    {
      href: '/account/profile',
      icon: UserRound,
      title: 'Profile',
      text: [user.email, user.phone].filter(Boolean).join(' · '),
    },
    {
      href: '/account/addresses',
      icon: MapPin,
      title: 'Addresses',
      text: addresses.length ? `${addresses.length} saved` : 'Add a delivery address',
    },
    {
      href: '/account/security',
      icon: ShieldCheck,
      title: 'Security',
      text: 'Password and signed-in devices',
    },
    {
      href: '/account/notifications',
      icon: Bell,
      title: 'Notifications',
      text: unread ? `${unread} unread` : 'You’re all caught up',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1">Hello, {user.name.split(' ')[0]}</h1>
        <p className="mt-1 text-text-muted">Manage your details, addresses and security.</p>
      </div>
      {needsVerification && (
        <Alert
          variant="info"
          title="Verify your contact details"
          action={
            <Link href="/account/profile" className="text-small font-semibold">
              Verify now
            </Link>
          }
        >
          Verified contacts help us send order updates and keep your account secure.
        </Alert>
      )}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        {cards.map(({ href, icon: Icon, title, text }) => (
          <li key={href}>
            <Card interactive className="relative flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-md bg-primary-light text-primary">
                <Icon size={22} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-h5">
                  <Link
                    href={href}
                    className="text-text-primary no-underline after:absolute after:inset-0"
                  >
                    {title}
                  </Link>
                </h2>
                <p className="truncate text-small text-text-muted">{text}</p>
              </div>
              <ChevronRight size={20} aria-hidden="true" className="text-text-muted" />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
