import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { getPage, withSeo } from '@/lib/content/api';
import { Markdown } from '@/lib/content/markdown';
import { longDate } from '@/lib/orders/format';
import { breadcrumbJsonLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/site';
import { JsonLd } from '@/components/seo/JsonLd';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getPage((await params).slug);
  return withSeo(
    `/pages/${p.slug}`,
    pageMetadata({
      title: p.metaTitle ?? p.title,
      description: p.metaDescription,
      path: `/pages/${p.slug}`,
    }),
  );
}

/** CMS page (policies, about us), managed in Admin → Pages. */
export default async function CmsPage({ params }: Props) {
  const page = await getPage((await params).slug);
  return (
    <div className="container-page py-6 sm:py-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: page.title, path: `/pages/${page.slug}` },
        ])}
      />
      <Breadcrumbs
        items={[
          { name: 'Home', href: '/' },
          { name: page.title, href: `/pages/${page.slug}` },
        ]}
      />
      <article className="mt-4">
        <h1 className="text-h1">{page.title}</h1>
        <p className="mt-2 text-small text-text-muted">Last updated {longDate(page.updatedAt)}</p>
        <Markdown source={page.content} className="cms-content mt-6" />
      </article>
    </div>
  );
}
