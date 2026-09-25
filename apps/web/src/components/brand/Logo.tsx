import Image from 'next/image';
import { cn } from '@seshakart/ui';

/**
 * The SeShaKart logo. Always rendered from the approved image assets in
 * /public/brand/logo — never recreated in CSS or text.
 *
 * NOTE: current files are PROVISIONAL crops of concept 01 "Smart S" from the brand
 * board (see brand/README.md). Swap the files when the master SVG is delivered.
 */
const ASSETS = {
  horizontal: { src: 'seshakart-logo-horizontal', width: 808, height: 240 },
  stacked: { src: 'seshakart-logo-stacked', width: 477, height: 437 },
  icon: { src: 'seshakart-icon', width: 365, height: 409 },
} as const;

export type LogoVariant = keyof typeof ASSETS;

export interface LogoProps {
  variant?: LogoVariant;
  /** `reversed` = white wordmark for navy/dark surfaces. */
  tone?: 'default' | 'reversed';
  /** Rendered height in px. Width follows the aspect ratio. Minimum sizes: see BRAND_DESIGN_SYSTEM.md. */
  height?: number;
  priority?: boolean;
  className?: string;
}

export function Logo({
  variant = 'horizontal',
  tone = 'default',
  height = 40,
  priority,
  className,
}: LogoProps) {
  const asset = ASSETS[variant];
  const reversed = tone === 'reversed' && variant !== 'icon' ? '-reversed' : '';
  const width = Math.round((asset.width / asset.height) * height);
  return (
    <Image
      src={`/brand/logo/${asset.src}${reversed}-provisional.png`}
      alt="SeShaKart"
      width={width}
      height={height}
      priority={priority}
      sizes={`${width}px`}
      className={cn('h-auto select-none', className)}
      style={{ width, maxWidth: '100%' }}
    />
  );
}
