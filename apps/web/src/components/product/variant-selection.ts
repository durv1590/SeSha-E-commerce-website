import type { VariantDto } from '@seshakart/types';

/** Finds the variant matching all selected option values (null if none). */
export function findVariant(
  variants: VariantDto[],
  selection: Record<string, string>,
): VariantDto | null {
  return (
    variants.find((v) => Object.entries(selection).every(([k, val]) => v.options[k] === val)) ??
    null
  );
}

/** Values of `option` that form an existing variant together with the other current selections. */
export function availableValues(
  variants: VariantDto[],
  option: string,
  selection: Record<string, string>,
): Set<string> {
  const others = Object.entries(selection).filter(([k]) => k !== option);
  return new Set(
    variants
      .filter((v) => others.every(([k, val]) => v.options[k] === val))
      .map((v) => v.options[option]!)
      .filter(Boolean),
  );
}

/**
 * Display order for option names. Stored options are JSONB, which does not keep key
 * order, so a conventional order is applied: colour first, then size/capacity, then
 * anything else alphabetically.
 */
const OPTION_PRIORITY = [
  'colour',
  'color',
  'size',
  'storage',
  'memory',
  'capacity',
  'weight',
  'pack',
  'flavour',
];

export function orderOptionNames(names: string[]): string[] {
  const rank = (n: string) => {
    const i = OPTION_PRIORITY.indexOf(n.toLowerCase());
    return i === -1 ? OPTION_PRIORITY.length : i;
  };
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** All distinct values per option, in first-seen order. */
export function optionValues(
  variants: VariantDto[],
  optionNames: string[],
): Record<string, string[]> {
  return Object.fromEntries(
    optionNames.map((n) => [
      n,
      [...new Set(variants.map((v) => v.options[n]).filter(Boolean) as string[])],
    ]),
  );
}

/**
 * Choosing a value that doesn't combine with the other current selections switches
 * to the closest existing variant that has it (prefer one in stock).
 */
export function selectValue(
  variants: VariantDto[],
  selection: Record<string, string>,
  option: string,
  value: string,
): VariantDto | null {
  const exact = findVariant(variants, { ...selection, [option]: value });
  if (exact) return exact;
  const candidates = variants.filter((v) => v.options[option] === value);
  return candidates.find((v) => v.available > 0) ?? candidates[0] ?? null;
}
