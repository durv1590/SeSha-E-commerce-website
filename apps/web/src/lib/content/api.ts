import 'server-only';
import type { CmsPageDto, SeoOverrideDto } from '@seshakart/types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError } from '../api/errors';
import { serverApi } from '../api/server';
import { mergeSeo } from './seo';

const cached = { auth: false, revalidate: 60, tags: ['content'] } as const;

/** Published CMS pages for the footer. Empty (never an error) if the API is down. */
export async function getPages(): Promise<{ slug: string; title: string }[]> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return [];
  try {
    return (await serverApi<{ slug: string; title: string }[]>('/pages', cached)).data;
  } catch {
    return [];
  }
}

export async function getPage(slug: string): Promise<CmsPageDto> {
  try {
    return (await serverApi<CmsPageDto>(`/pages/${encodeURIComponent(slug)}`, cached)).data;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) notFound();
    throw err;
  }
}

/** Admin SEO overrides (cached). Empty, never an error, if the API is down. */
export async function getSeoOverrides(): Promise<SeoOverrideDto[]> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return [];
  try {
    return (await serverApi<SeoOverrideDto[]>('/seo-overrides', cached)).data;
  } catch {
    return []; // SEO overrides are an enhancement: never break a page over them
  }
}

/** Page metadata with the admin's SEO override for `path`, if any. */
export async function withSeo(path: string, base: Metadata): Promise<Metadata> {
  return mergeSeo(
    base,
    (await getSeoOverrides()).find((o) => o.path === path),
  );
}
