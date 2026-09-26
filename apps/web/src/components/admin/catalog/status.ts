import type { ProductStatusDto } from '@seshakart/types';
import type { BadgeVariant } from '@seshakart/ui';

export const PRODUCT_STATUS: Record<ProductStatusDto, { label: string; badge: BadgeVariant }> = {
  ACTIVE: { label: 'Live', badge: 'success' },
  DRAFT: { label: 'Draft', badge: 'neutral' },
  ARCHIVED: { label: 'Archived', badge: 'warning' },
};
