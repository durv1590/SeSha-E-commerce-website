import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { getCurrentUser } from '@/lib/auth/session';
import { safeRedirectPath } from '@/lib/safe-redirect';

export const metadata: Metadata = {
  title: 'Create account',
  robots: { index: false, follow: true },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeRedirectPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthCard
      title="Create your account"
      subtitle="Smart Shopping, Better Living — it takes less than a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm next={next} />
    </AuthCard>
  );
}
