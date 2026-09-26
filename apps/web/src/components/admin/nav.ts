import type { Permission } from '@seshakart/types';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

/** Admin navigation; each entry shows only to staff holding its permission. */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: 'dashboard', permission: 'dashboard:read' },
    ],
  },
];

export function navFor(permissions: readonly Permission[]): AdminNavGroup[] {
  return ADMIN_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => permissions.includes(i.permission)),
  })).filter((g) => g.items.length > 0);
}
