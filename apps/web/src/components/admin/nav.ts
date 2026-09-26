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
      { href: '/admin/reports', label: 'Reports', icon: 'reports', permission: 'analytics:read' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/admin/orders', label: 'Orders', icon: 'orders', permission: 'orders:read' },
      { href: '/admin/returns', label: 'Returns', icon: 'returns', permission: 'orders:read' },
      {
        href: '/admin/customers',
        label: 'Customers',
        icon: 'customers',
        permission: 'customers:read',
      },
      { href: '/admin/coupons', label: 'Coupons', icon: 'coupons', permission: 'coupons:write' },
      { href: '/admin/reviews', label: 'Reviews', icon: 'reviews', permission: 'reviews:moderate' },
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
  {
    label: 'Content',
    items: [
      {
        href: '/admin/content/banners',
        label: 'Banners',
        icon: 'content',
        permission: 'content:write',
      },
      { href: '/admin/content/home', label: 'Homepage', icon: 'home', permission: 'content:write' },
      { href: '/admin/content/pages', label: 'Pages', icon: 'pages', permission: 'content:write' },
      { href: '/admin/seo', label: 'SEO', icon: 'seo', permission: 'seo:write' },
    ],
  },
  {
    label: 'Store',
    items: [
      {
        href: '/admin/settings',
        label: 'Settings',
        icon: 'settings',
        permission: 'settings:write',
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
