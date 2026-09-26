'use client';

import type { AdminSeoOverrideDto } from '@seshakart/types';
import { Badge, Button, Checkbox, FormField, Input, Textarea, cn, useToast } from '@seshakart/ui';
import { seoOverrideInputSchema } from '@seshakart/validation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { AdminTable, td, th } from '../AdminTable';
import { ConfirmDialog } from '../ConfirmDialog';
import { FormDialog } from '../FormDialog';
import { ImageField } from '../ImageField';

interface Draft {
  path: string;
  title: string;
  description: string;
  ogImage: string;
  noindex: boolean;
}

/** Per-page search engine settings that override the automatic title and description. */
export function SeoManager({ rules }: { rules: AdminSeoOverrideDto[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<{ rule?: AdminSeoOverrideDto; d: Draft } | null>(null);
  const [deleting, setDeleting] = useState<AdminSeoOverrideDto | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setEditing((e) => (e ? { ...e, d: { ...e.d, [k]: v } } : e));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          onClick={() =>
            setEditing({
              d: { path: '/', title: '', description: '', ogImage: '', noindex: false },
            })
          }
        >
          <Plus size={16} aria-hidden="true" /> Add page
        </Button>
      </div>
      {rules.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-4 text-small text-text-muted">
          No overrides. Pages use their own titles and descriptions (products, categories and brands
          have SEO fields in their editors).
        </p>
      ) : (
        <AdminTable label="SEO overrides">
          <thead className="border-b border-border bg-surface-muted">
            <tr>
              <th scope="col" className={th}>
                Page
              </th>
              <th scope="col" className={th}>
                Title and description
              </th>
              <th scope="col" className={th}>
                Search engines
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-border first:border-t-0">
                <th scope="row" className={cn(td, 'text-left font-mono text-small')}>
                  {r.path}
                </th>
                <td className={td}>
                  <span className="block font-medium">
                    {r.title ?? <span className="text-text-muted">Automatic title</span>}
                  </span>
                  {r.description && (
                    <span className="line-clamp-2 block text-caption text-text-secondary">
                      {r.description}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {r.noindex ? (
                    <Badge variant="warning">Hidden</Badge>
                  ) : (
                    <Badge variant="success">Indexed</Badge>
                  )}
                </td>
                <td className={cn(td, 'text-right')}>
                  <span className="inline-flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Edit ${r.path}`}
                      onClick={() =>
                        setEditing({
                          rule: r,
                          d: {
                            path: r.path,
                            title: r.title ?? '',
                            description: r.description ?? '',
                            ogImage: r.ogImage ?? '',
                            noindex: r.noindex,
                          },
                        })
                      }
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${r.path}`}
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.rule ? `SEO for ${editing.rule.path}` : 'Add SEO for a page'}
        submitLabel="Save"
        onSubmit={async () => {
          if (!editing) return;
          const parsed = seoOverrideInputSchema.safeParse(editing.d);
          if (!parsed.success)
            return Object.fromEntries(
              parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
            );
          if (editing.rule) await api.put(`/admin/seo/${editing.rule.id}`, editing.d);
          else await api.post('/admin/seo', editing.d);
          toast({ title: 'SEO saved', variant: 'success' });
          router.refresh();
        }}
      >
        {(e) =>
          editing && (
            <>
              <FormField
                label="Page path"
                required
                hint="e.g. / (homepage), /deals, /category/mobiles, /pages/about-us"
                error={e.path}
              >
                <Input
                  name="path"
                  value={editing.d.path}
                  maxLength={300}
                  spellCheck={false}
                  onChange={(ev) => set('path', ev.target.value)}
                />
              </FormField>
              <FormField
                label="Title"
                hint={`Shown as-is in search results. ${editing.d.title.length}/70`}
                error={e.title}
              >
                <Input
                  name="title"
                  value={editing.d.title}
                  maxLength={70}
                  onChange={(ev) => set('title', ev.target.value)}
                />
              </FormField>
              <FormField
                label="Description"
                hint={`${editing.d.description.length}/160`}
                error={e.description}
              >
                <Textarea
                  name="description"
                  value={editing.d.description}
                  rows={3}
                  maxLength={160}
                  onChange={(ev) => set('description', ev.target.value)}
                />
              </FormField>
              <ImageField
                label="Sharing image"
                hint="Shown when the page is shared on WhatsApp or social media; 1200 × 630 works best"
                aspect="aspect-[1.9/1]"
                value={editing.d.ogImage}
                error={e.ogImage}
                onChange={(v) => set('ogImage', v)}
              />
              <Checkbox
                label="Hide from search engines"
                description="Adds noindex. Use for pages that shouldn’t appear in Google."
                checked={editing.d.noindex}
                onChange={(ev) => set('noindex', ev.target.checked)}
              />
            </>
          )
        }
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Remove SEO settings for ${deleting?.path ?? ''}?`}
        description="The page goes back to its automatic title and description."
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          await api.delete(`/admin/seo/${deleting!.id}`);
          toast({ title: 'SEO settings removed', variant: 'success' });
          router.refresh();
        }}
      />
    </div>
  );
}
