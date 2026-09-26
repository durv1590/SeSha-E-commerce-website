'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics/track';

/** Reports a search results view (the query only; results stay on the site). */
export function TrackSearch({ query }: { query: string }) {
  useEffect(() => {
    track({ name: 'search', query });
  }, [query]);
  return null;
}
