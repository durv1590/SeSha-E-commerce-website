import type { Metadata } from 'next';
import { PageHeader } from '@/components/admin/PageHeader';
import { QueueTabs } from '@/components/admin/QueueTabs';
import { SettingsForm } from '@/components/admin/content/SettingsForm';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Settings' };

const TABS = [
  ['store', 'Store'],
  ['commerce', 'Checkout'],
  ['shipping', 'Delivery'],
  ['search', 'Search'],
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireStaff('/admin/settings', 'settings:write');
  const requested = (await searchParams).tab;
  const tab = TABS.find(([k]) => k === requested)?.[0] ?? 'store';
  const { data } = await serverApi<Record<string, unknown>>(`/admin/settings/${tab}`);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description="Changes apply to the store immediately." />
      <QueueTabs
        label="Settings sections"
        items={TABS.map(([k, label]) => ({
          href: `/admin/settings${k === 'store' ? '' : `?tab=${k}`}`,
          label,
          current: tab === k,
        }))}
      />
      <SettingsForm key={tab} settingsKey={tab} initial={data} />
    </div>
  );
}
