import type { Role } from './enums';

/**
 * Role-based access control matrix.
 *
 * Permissions are defined in code (versioned, reviewed, testable) rather than in
 * database rows. The API enforces them with `@RequirePermissions()`; the web admin
 * uses the same matrix only to decide what to *display* — hiding a button is never
 * the security boundary.
 */
export const PERMISSIONS = [
  'dashboard:read',
  'products:read',
  'products:write',
  'products:delete',
  'categories:write',
  'brands:write',
  'inventory:read',
  'inventory:write',
  'orders:read',
  'orders:write',
  'orders:refund',
  'customers:read',
  'customers:write',
  'coupons:write',
  'reviews:moderate',
  'content:write',
  'seo:write',
  'analytics:read',
  'settings:write',
  'audit:read',
  'staff:write',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  ADMIN: PERMISSIONS.filter((p) => p !== 'staff:write'),
  MANAGER: [
    'dashboard:read',
    'products:read',
    'products:write',
    'categories:write',
    'brands:write',
    'inventory:read',
    'inventory:write',
    'orders:read',
    'orders:write',
    'customers:read',
    'coupons:write',
    'reviews:moderate',
    'content:write',
    'seo:write',
    'analytics:read',
  ],
  INVENTORY_MANAGER: [
    'dashboard:read',
    'products:read',
    'inventory:read',
    'inventory:write',
    'orders:read',
  ],
  CUSTOMER_SUPPORT: [
    'dashboard:read',
    'products:read',
    'orders:read',
    'orders:write',
    'customers:read',
    'reviews:moderate',
  ],
  CUSTOMER: [],
};

export const STAFF_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'INVENTORY_MANAGER',
  'CUSTOMER_SUPPORT',
];

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAllPermissions(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}
