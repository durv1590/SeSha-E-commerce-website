import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/LoginForm';
import { getCurrentUser } from '@/lib/auth/session';
import { safeRedirectPath } from '@/lib/safe-redirect';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeRedirectPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to track orders, save addresses and check out faster."
      footer={
        <>
          New to SeShaKart?{' '}
          <Link
            href={`/register${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-semibold"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthCard>
  );
}
