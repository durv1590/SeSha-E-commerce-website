'use client';

import type { StaffMemberDto } from '@seshakart/types';
import { Badge, Button, FormField, Input, Select, cn, useToast } from '@seshakart/ui';
import { STAFF_ROLES_EDITABLE, staffInviteSchema } from '@seshakart/validation';
import { Pencil, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { dateTime } from '@/lib/orders/format';
import { AdminTable, td, th } from '../AdminTable';
import { FormDialog } from '../FormDialog';

export const ROLE_INFO: Record<
  (typeof STAFF_ROLES_EDITABLE)[number],
  { label: string; can: string }
> = {
  SUPER_ADMIN: { label: 'Super admin', can: 'Everything, including staff accounts' },
  ADMIN: { label: 'Admin', can: 'Everything except staff accounts' },
  MANAGER: {
    label: 'Manager',
    can: 'Catalogue, orders, customers (view), coupons, content, reviews, reports',
  },
  INVENTORY_MANAGER: { label: 'Inventory manager', can: 'Products (view), stock, orders (view)' },
  CUSTOMER_SUPPORT: { label: 'Customer support', can: 'Orders, customers (view), reviews' },
};

/** Staff accounts: invite by email, change role, suspend or remove access. */
export function StaffManager({ staff: initial }: { staff: StaffMemberDto[] }) {
  const { toast } = useToast();
  const [staff, setStaff] = useState(initial);
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState({ name: '', email: '', role: 'CUSTOMER_SUPPORT' });
  const [editing, setEditing] = useState<StaffMemberDto | null>(null);
  const [edit, setEdit] = useState<{ role: string; status: 'ACTIVE' | 'SUSPENDED' }>({
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          onClick={() => {
            setInvite({ name: '', email: '', role: 'CUSTOMER_SUPPORT' });
            setInviting(true);
          }}
        >
          <UserPlus size={16} aria-hidden="true" /> Add staff member
        </Button>
      </div>
      <AdminTable label="Staff">
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            <th scope="col" className={th}>
              Name
            </th>
            <th scope="col" className={th}>
              Role
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Last sign-in
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id} className="border-t border-border first:border-t-0">
              <th scope="row" className={cn(td, 'text-left font-normal')}>
                <span className="block font-medium">
                  {s.name}
                  {s.isSelf && <span className="text-text-muted"> (you)</span>}
                </span>
                <span className="block text-caption text-text-muted">{s.email ?? s.phone}</span>
              </th>
              <td className={td}>{ROLE_INFO[s.role as keyof typeof ROLE_INFO]?.label ?? s.role}</td>
              <td className={td}>
                <span className="flex flex-wrap gap-1">
                  <Badge variant={s.status === 'ACTIVE' ? 'success' : 'error'}>
                    {s.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                  </Badge>
                  {!s.hasPassword && <Badge variant="warning">Invited</Badge>}
                </span>
              </td>
              <td className={cn(td, 'whitespace-nowrap text-text-secondary')}>
                {s.lastLoginAt ? dateTime(s.lastLoginAt) : 'Never'}
              </td>
              <td className={cn(td, 'text-right')}>
                {!s.isSelf && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEdit({ role: s.role, status: s.status });
                      setEditing(s);
                    }}
                  >
                    <Pencil size={14} aria-hidden="true" /> Change
                    <span className="sr-only"> access for {s.name}</span>
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTable>

      <section
        aria-labelledby="roles-h"
        className="rounded-card border border-border bg-surface p-4"
      >
        <h2 id="roles-h" className="text-h5">
          What each role can do
        </h2>
        <dl className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1 text-small sm:grid-cols-[auto_minmax(0,1fr)]">
          {Object.values(ROLE_INFO).map((r) => (
            <div key={r.label} className="contents">
              <dt className="font-medium">{r.label}</dt>
              <dd className="mb-1 text-text-secondary sm:mb-0">{r.can}</dd>
            </div>
          ))}
        </dl>
      </section>

      <FormDialog
        open={inviting}
        onClose={() => setInviting(false)}
        title="Add staff member"
        description="They get an email asking them to set their own password. If the email belongs to a customer account, that account gets staff access."
        submitLabel="Send invitation"
        onSubmit={async () => {
          const parsed = staffInviteSchema.safeParse(invite);
          if (!parsed.success)
            return Object.fromEntries(
              parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
            );
          setStaff(await api.post<StaffMemberDto[]>('/admin/staff', invite));
          toast({ title: `Invitation sent to ${parsed.data.email}`, variant: 'success' });
        }}
      >
        {(e) => (
          <>
            <FormField label="Name" required error={e.name}>
              <Input
                name="name"
                value={invite.name}
                maxLength={80}
                onChange={(ev) => setInvite((v) => ({ ...v, name: ev.target.value }))}
              />
            </FormField>
            <FormField label="Work email" required error={e.email}>
              <Input
                name="email"
                type="email"
                value={invite.email}
                maxLength={254}
                autoCapitalize="none"
                onChange={(ev) => setInvite((v) => ({ ...v, email: ev.target.value }))}
              />
            </FormField>
            <FormField
              label="Role"
              required
              hint={ROLE_INFO[invite.role as keyof typeof ROLE_INFO]?.can}
              error={e.role}
            >
              <Select
                name="role"
                value={invite.role}
                onChange={(ev) => setInvite((v) => ({ ...v, role: ev.target.value }))}
              >
                {STAFF_ROLES_EDITABLE.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_INFO[r].label}
                  </option>
                ))}
              </Select>
            </FormField>
          </>
        )}
      </FormDialog>

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Access for ${editing?.name ?? ''}`}
        description="Suspending or removing access signs them out everywhere at once."
        submitLabel="Save"
        danger={edit.status === 'SUSPENDED' || edit.role === 'CUSTOMER'}
        onSubmit={async () => {
          setStaff(await api.put<StaffMemberDto[]>(`/admin/staff/${editing!.id}`, edit));
          toast({ title: 'Access updated', variant: 'success' });
        }}
      >
        {(e) => (
          <>
            <FormField
              label="Role"
              error={e.role}
              hint={
                edit.role === 'CUSTOMER'
                  ? 'They keep their customer account but lose admin access.'
                  : ROLE_INFO[edit.role as keyof typeof ROLE_INFO]?.can
              }
            >
              <Select
                name="role"
                value={edit.role}
                onChange={(ev) => setEdit((v) => ({ ...v, role: ev.target.value }))}
              >
                {STAFF_ROLES_EDITABLE.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_INFO[r].label}
                  </option>
                ))}
                <option value="CUSTOMER">No staff access (customer)</option>
              </Select>
            </FormField>
            <FormField label="Status" error={e.status}>
              <Select
                name="status"
                value={edit.status}
                onChange={(ev) =>
                  setEdit((v) => ({ ...v, status: ev.target.value as 'ACTIVE' | 'SUSPENDED' }))
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended (can’t sign in)</option>
              </Select>
            </FormField>
          </>
        )}
      </FormDialog>
    </div>
  );
}
