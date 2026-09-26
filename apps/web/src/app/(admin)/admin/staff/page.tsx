import type { StaffMemberDto } from '@seshakart/types';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/admin/PageHeader';
import { StaffManager } from '@/components/admin/engagement/StaffManager';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Staff' };

export default async function StaffPage() {
  await requireStaff('/admin/staff', 'staff:write');
  const { data } = await serverApi<StaffMemberDto[]>('/admin/staff');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Staff"
        description="People who can use this admin, and what they can do."
      />
      <StaffManager staff={data} />
    </div>
  );
}
