import { ProfileForm } from '@/components/account/ProfileForm';
import { requireUser } from '@/lib/auth/session';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const user = await requireUser('/account/profile');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1">Profile</h1>
        <p className="mt-1 text-text-muted">Your name and contact details.</p>
      </div>
      <ProfileForm user={user} />
    </div>
  );
}
