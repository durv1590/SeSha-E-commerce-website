import {
  BadgeCheck,
  Cpu,
  LayoutGrid,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Truck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { iconSizes, type IconSize } from '@seshakart/ui/tokens';

/**
 * The brand's "usage elements" (brand board): Trust, Smart Shopping, Technology,
 * Convenience, Choice, Speed, Growth. Line icons, 2px stroke, rounded caps.
 */
export const BRAND_ICONS = {
  trust: ShieldCheck,
  'smart-shopping': ShoppingBag,
  technology: Cpu,
  convenience: Truck,
  choice: LayoutGrid,
  speed: Zap,
  growth: TrendingUp,
  genuine: BadgeCheck,
  returns: RotateCcw,
} satisfies Record<string, LucideIcon>;

export type BrandIconName = keyof typeof BRAND_ICONS;

export function BrandIcon({
  name,
  size = 'lg',
  className,
}: {
  name: BrandIconName;
  size?: IconSize;
  className?: string;
}) {
  const Icon = BRAND_ICONS[name];
  return <Icon size={iconSizes[size]} strokeWidth={2} className={className} aria-hidden="true" />;
}
