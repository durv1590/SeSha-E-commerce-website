import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/admin/PageHeader';
import { ProductImport } from '@/components/admin/catalog/ProductImport';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Import products' };

export default async function ImportPage() {
  await requireStaff('/admin/products/import', 'products:write');
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="Import products"
        description="Create or update products and variants from a spreadsheet."
        back={
          <Link
            href="/admin/products"
            className="self-start text-small font-medium text-primary-dark"
          >
            ← All products
          </Link>
        }
      />
      <ProductImport />
    </div>
  );
}
