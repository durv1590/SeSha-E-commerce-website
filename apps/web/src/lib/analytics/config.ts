/**
 * Tracker IDs from the build environment. Anything that isn't a well-formed ID is ignored,
 * so a typo can never inject into a script URL. Unset = that tool is off (and with both
 * off, no consent banner is shown because no optional cookies exist).
 */
const ga = process.env.NEXT_PUBLIC_ANALYTICS_ID?.trim() ?? '';
const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ?? '';

export const GA_ID = /^G-[A-Z0-9]{4,20}$/.test(ga) ? ga : '';
export const META_PIXEL_ID = /^\d{6,20}$/.test(pixel) ? pixel : '';
export const TRACKING_CONFIGURED = Boolean(GA_ID || META_PIXEL_ID);
