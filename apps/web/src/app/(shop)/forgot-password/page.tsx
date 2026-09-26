import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Reset password',
  robots: { index: false, follow: true },
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email or mobile number and we’ll send you a code."
      footer={
        <Link href="/login" className="font-semibold">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
