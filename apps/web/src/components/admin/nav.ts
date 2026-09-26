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
  {
    label: 'Catalogue',
    items: [
      { href: '/admin/products', label: 'Products', icon: 'products', permission: 'products:read' },
      {
        href: '/admin/categories',
        label: 'Categories',
        icon: 'categories',
        permission: 'categories:write',
      },
      { href: '/admin/brands', label: 'Brands', icon: 'brands', permission: 'brands:write' },
      {
        href: '/admin/inventory',
        label: 'Inventory',
        icon: 'inventory',
        permission: 'inventory:read',
      },
    ],
  },
];

export function navFor(permissions: readonly Permission[]): AdminNavGroup[] {
  return ADMIN_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => permissions.includes(i.permission)),
  })).filter((g) => g.items.length > 0);
}
