import type { SessionDto } from '@seshakart/types';
import { SecurityPanel } from '@/components/account/SecurityPanel';
import { serverApi } from '@/lib/api/server';
import { requireUser } from '@/lib/auth/session';

export const metadata = { title: 'Security' };

export default async function SecurityPage() {
  const user = await requireUser('/account/security');
  const { data: sessions } = await serverApi<SessionDto[]>('/users/me/sessions');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1">Security</h1>
        <p className="mt-1 text-text-muted">Keep your account safe.</p>
      </div>
      <SecurityPanel user={user} sessions={sessions} />
    </div>
  );
}
