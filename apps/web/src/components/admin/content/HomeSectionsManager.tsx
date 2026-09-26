'use client';

import type { AdminCategoryDto, AdminHomeSectionDto } from '@seshakart/types';
import { Badge, Button, Checkbox, FormField, Input, Select, useToast } from '@seshakart/ui';
import { homeSectionInputSchema } from '@seshakart/validation';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { ConfirmDialog } from '../ConfirmDialog';
import { FormDialog } from '../FormDialog';

const SOURCES: Record<AdminHomeSectionDto['source'], string> = {
  BEST_SELLERS: 'Best sellers',
  NEW_ARRIVALS: 'New arrivals',
  FEATURED: 'Featured products',
  DEALS: 'Deals (20% off or more)',
  CATEGORY: 'Popular in a category',
};

interface Draft {
  title: string;
  subtitle: string;
  source: AdminHomeSectionDto['source'];
  categoryId: string;
  limit: string;
  isActive: boolean;
}

/**
 * Product rails on the homepage, in display order. Rails fill themselves from live
 * products; a rail with no products is skipped automatically.
 */
export function HomeSectionsManager({
  sections: initial,
  categories,
}: {
  sections: AdminHomeSectionDto[];
  categories: AdminCategoryDto[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [sections, setSections] = useState(initial);
  const [editing, setEditing] = useState<{ section?: AdminHomeSectionDto; d: Draft } | null>(null);
  const [deleting, setDeleting] = useState<AdminHomeSectionDto | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setEditing((e) => (e ? { ...e, d: { ...e.d, [k]: v } } : e));

  const move = async (from: number, to: number) => {
    const next = [...sections];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setBusy(true);
    try {
      setSections(
        await api.put<AdminHomeSectionDto[]>('/admin/home-sections/order', {
          ids: next.map((s) => s.id),
        }),
      );
      setStatus(`“${item!.title}” moved to position ${to + 1} of ${next.length}.`);
      router.refresh();
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Couldn’t reorder. Reload and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      <div>
        <Button
          onClick={() =>
            setEditing({
              d: {
                title: '',
                subtitle: '',
                source: 'BEST_SELLERS',
                categoryId: '',
                limit: '12',
                isActive: true,
              },
            })
          }
        >
          <Plus size={16} aria-hidden="true" /> Add section
        </Button>
      </div>
      {sections.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-4 text-small text-text-muted">
          No sections. The homepage shows banners, categories and brands only.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {sections.map((s, i) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3"
            >
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-small font-semibold tabular-nums"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {s.title}
                  {!s.isActive && (
                    <Badge variant="neutral" className="ml-2">
                      Hidden
                    </Badge>
                  )}
                </p>
                <p className="text-small text-text-secondary">
                  {s.source === 'CATEGORY'
                    ? `Popular in ${s.categoryName ?? 'a deleted category'}`
                    : SOURCES[s.source]}{' '}
                  · up to {s.limit} products
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy || i === 0}
                  aria-label={`Move ${s.title} up`}
                  onClick={() => void move(i, i - 1)}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy || i === sections.length - 1}
                  aria-label={`Move ${s.title} down`}
                  onClick={() => void move(i, i + 1)}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Edit ${s.title}`}
                  onClick={() =>
                    setEditing({
                      section: s,
                      d: {
                        title: s.title,
                        subtitle: s.subtitle ?? '',
                        source: s.source,
                        categoryId: s.categoryId ?? '',
                        limit: String(s.limit),
                        isActive: s.isActive,
                      },
                    })
                  }
                >
                  <Pencil size={16} aria-hidden="true" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${s.title}`}
                  onClick={() => setDeleting(s)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.section ? `Edit “${editing.section.title}”` : 'Add homepage section'}
        submitLabel="Save"
        onSubmit={async () => {
          if (!editing) return;
          const payload = {
            ...editing.d,
            categoryId: editing.d.categoryId || null,
            limit: Number(editing.d.limit) || 0,
          };
          const parsed = homeSectionInputSchema.safeParse(payload);
          if (!parsed.success)
            return Object.fromEntries(
              parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
            );
          const next = editing.section
            ? await api.put<AdminHomeSectionDto[]>(
                `/admin/home-sections/${editing.section.id}`,
                payload,
              )
            : await api.post<AdminHomeSectionDto[]>('/admin/home-sections', payload);
          setSections(next);
          toast({ title: 'Section saved', variant: 'success' });
          router.refresh();
        }}
      >
        {(e) =>
          editing && (
            <>
              <FormField label="Heading" required error={e.title}>
                <Input
                  name="title"
                  value={editing.d.title}
                  maxLength={60}
                  onChange={(ev) => set('title', ev.target.value)}
                />
              </FormField>
              <FormField label="Subheading" error={e.subtitle}>
                <Input
                  name="subtitle"
                  value={editing.d.subtitle}
                  maxLength={120}
                  onChange={(ev) => set('subtitle', ev.target.value)}
                />
              </FormField>
              <FormField label="Products to show" required error={e.source}>
                <Select
                  name="source"
                  value={editing.d.source}
                  onChange={(ev) => set('source', ev.target.value as Draft['source'])}
                >
                  {Object.entries(SOURCES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </FormField>
              {editing.d.source === 'CATEGORY' && (
                <FormField label="Category" required error={e.categoryId}>
                  <Select
                    name="categoryId"
                    value={editing.d.categoryId}
                    onChange={(ev) => set('categoryId', ev.target.value)}
                  >
                    <option value="">Choose a category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {' '.repeat(c.depth)}
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              <FormField label="Number of products" hint="4–24" error={e.limit}>
                <Input
                  name="limit"
                  value={editing.d.limit}
                  inputMode="numeric"
                  className="max-w-32"
                  onChange={(ev) => set('limit', ev.target.value)}
                />
              </FormField>
              <Checkbox
                label="Show on the homepage"
                checked={editing.d.isActive}
                onChange={(ev) => set('isActive', ev.target.checked)}
              />
            </>
          )
        }
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.title ?? ''}”?`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          setSections(
            await api.delete<AdminHomeSectionDto[]>(`/admin/home-sections/${deleting!.id}`),
          );
          toast({ title: 'Section deleted', variant: 'success' });
          router.refresh();
        }}
      />
    </div>
  );
}
