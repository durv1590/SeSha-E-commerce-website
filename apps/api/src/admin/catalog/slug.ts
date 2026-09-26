import { HttpStatus } from '@nestjs/common';
import { slugify } from '@seshakart/validation';
import { AppException } from '../../common/filters/all-exceptions.filter';

/**
 * Resolves the slug for a new or renamed record. An explicit slug must be free
 * (409 with a field error otherwise); a generated one gets "-2", "-3"… appended
 * until it is unique.
 */
export async function resolveSlug(
  explicit: string | undefined,
  name: string,
  taken: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (explicit) {
    if (await taken(explicit))
      throw new AppException(
        HttpStatus.CONFLICT,
        'SLUG_TAKEN',
        'This URL is already used by another item.',
        [{ path: 'slug', message: 'Already in use. Choose another URL.' }],
      );
    return explicit;
  }
  const base = slugify(name) || 'item';
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 155)}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new AppException(HttpStatus.CONFLICT, 'SLUG_TAKEN', 'Choose a different URL.');
}
