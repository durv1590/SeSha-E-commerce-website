'use client';

import type { ProductImportResultDto } from '@seshakart/types';
import { Alert, Button, buttonVariants, useToast } from '@seshakart/ui';
import { FileCheck2, FileUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { api } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { AdminTable, td, th } from '../AdminTable';

const TEMPLATE =
  'product_sku,product_name,category_slug,brand_slug,tax_rate,hsn_code,short_description,variant_sku,variant_name,options,mrp,price,stock\r\n' +
  'TEE-001,Classic Cotton T-Shirt,men-t-shirts,,5,6109,Soft everyday tee,TEE-001-BLK-M,Black / M,Colour: Black | Size: M,999,699,25\r\n' +
  'TEE-001,,,,,,,TEE-001-BLK-L,Black / L,Colour: Black | Size: L,999,699,20\r\n';

/**
 * Two-step CSV import: "Check file" validates everything without saving and lists
 * each problem by line; "Import" applies the whole file in one transaction.
 */
export function ProductImport() {
  const router = useRouter();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ProductImportResultDto | null>(null);
  const [busy, setBusy] = useState<null | 'check' | 'apply'>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? 'check' : 'apply');
    setError(null);
    try {
      const r = await api.upload<ProductImportResultDto>(
        `/admin/products/import?dryRun=${dryRun}`,
        file,
      );
      setResult(r);
      if (r.applied) {
        toast({ title: 'Import complete', variant: 'success' });
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The file couldn’t be uploaded.');
    } finally {
      setBusy(null);
    }
  };

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;
  const ok = result && result.errors.length === 0;
  const changes = result
    ? result.products.create +
      result.products.update +
      result.variants.create +
      result.variants.update
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-labelledby={`${id}-how`}
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:p-5"
      >
        <h2 id={`${id}-how`} className="text-h4">
          How it works
        </h2>
        <ul className="list-disc pl-5 text-small text-text-secondary">
          <li>One row per variant. Rows with the same product_sku belong to one product.</li>
          <li>
            Products and variants are matched by SKU: existing ones are updated, new ones are
            created as drafts. Nothing is ever deleted.
          </li>
          <li>
            Only the columns in your file are changed. Prices are in rupees; lists use “ | ”. Images
            are added in the product editor.
          </li>
          <li>A stock value sets the stock count (recorded in the stock history).</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <a
            href={templateHref}
            download="seshakart-import-template.csv"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Download template
          </a>
          <a
            href="/api/admin/products/export.csv"
            download
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Export current catalogue
          </a>
        </div>
      </section>

      <section
        aria-labelledby={`${id}-file`}
        className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:p-5"
      >
        <h2 id={`${id}-file`} className="text-h4">
          Upload a CSV file
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            id={`${id}-input`}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
            }}
          />
          <Button variant="outline" onClick={() => input.current?.click()}>
            <FileUp size={16} aria-hidden="true" /> {file ? 'Choose another file' : 'Choose file'}
          </Button>
          <span className="text-small text-text-secondary" aria-live="polite">
            {file
              ? `${file.name} (${Math.ceil(file.size / 1024)} KB)`
              : 'CSV, UTF-8, up to 2 MB and 5,000 rows'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!file}
            loading={busy === 'check'}
            loadingText="Checking…"
            onClick={() => void run(true)}
          >
            <FileCheck2 size={16} aria-hidden="true" /> Check file
          </Button>
          {ok && !result.applied && changes > 0 && (
            <Button
              variant="secondary"
              loading={busy === 'apply'}
              loadingText="Importing…"
              onClick={() => void run(false)}
            >
              Import {changes} change{changes === 1 ? '' : 's'}
            </Button>
          )}
        </div>
        {error && <Alert variant="error">{error}</Alert>}
      </section>

      {result && (
        <section
          aria-labelledby={`${id}-result`}
          aria-live="polite"
          className="flex flex-col gap-3"
        >
          <h2 id={`${id}-result`} className="text-h4">
            {result.applied ? 'Imported' : ok ? 'Ready to import' : 'Problems found'}
          </h2>
          {result.applied ? (
            <Alert variant="success">
              {result.rows} rows imported. New products are drafts:{' '}
              <Link href="/admin/products?status=DRAFT">review and publish them</Link>.
            </Alert>
          ) : ok ? (
            <Alert variant={changes ? 'info' : 'success'}>
              {changes
                ? 'No problems found. Nothing has been saved yet.'
                : 'Everything in this file already matches the catalogue.'}
            </Alert>
          ) : (
            <Alert variant="error">
              Nothing was imported. Fix these {result.errors.length === 200 ? 'first 200 ' : ''}
              problems in the file and check it again.
            </Alert>
          )}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['New products', result.products.create],
              ['Updated products', result.products.update],
              ['New variants', result.variants.create],
              ['Updated variants', result.variants.update],
            ].map(([label, n]) => (
              <div key={label} className="rounded-card border border-border bg-surface p-3">
                <dt className="text-caption text-text-secondary">{label}</dt>
                <dd className="text-h4 tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
          {result.errors.length > 0 && (
            <AdminTable label="Problems in the file">
              <thead className="border-b border-border bg-surface-muted">
                <tr>
                  <th scope="col" className={th}>
                    Line
                  </th>
                  <th scope="col" className={th}>
                    Column
                  </th>
                  <th scope="col" className={th}>
                    Problem
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((e, i) => (
                  <tr
                    key={`${e.line}-${e.column}-${i}`}
                    className="border-t border-border first:border-t-0"
                  >
                    <td className={`${td} tabular-nums`}>{e.line}</td>
                    <td className={`${td} font-mono text-caption`}>{e.column ?? '—'}</td>
                    <td className={td}>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          )}
        </section>
      )}
    </div>
  );
}
