'use client';

import type { AdminCategoryDto } from '@seshakart/types';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
  cn,
  useToast,
} from '@seshakart/ui';
import { categoryInputSchema, slugify } from '@seshakart/validation';
import { FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { AdminTable, td, th } from '../AdminTable';
import { ConfirmDialog } from '../ConfirmDialog';
import { ImageField } from '../ImageField';

const MAX_DEPTH = 2;

interface Draft {
  name: string;
  slug: string;
  parentId: string;
  description: string;
  seoContent: string;
  imageUrl: string;
  bannerUrl: string;
  sortOrder: string;
  isActive: boolean;
  isFeatured: boolean;
  metaTitle: string;
  metaDescription: string;
}

const toDraft = (c?: AdminCategoryDto, parentId = ''): Draft => ({
  name: c?.name ?? '',
  slug: c?.slug ?? '',
  parentId: c ? (c.parentId ?? '') : parentId,
  description: c?.description ?? '',
  seoContent: c?.seoContent ?? '',
  imageUrl: c?.imageUrl ?? '',
  bannerUrl: c?.bannerUrl ?? '',
  sortOrder: String(c?.sortOrder ?? 0),
  isActive: c?.isActive ?? true,
  isFeatured: c?.isFeatured ?? false,
  metaTitle: c?.metaTitle ?? '',
  metaDescription: c?.metaDescription ?? '',
});

/** Category tree (up to three levels): add, edit, move, hide and delete. */
export function CategoryManager({ categories }: { categories: AdminCategoryDto[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<{ category?: AdminCategoryDto; draft: Draft } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<AdminCategoryDto | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = (category?: AdminCategoryDto, parentId?: string) => {
    setErrors({});
    setFormError(null);
    setEditing({ category, draft: toDraft(category, parentId) });
  };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  // A category can't move under itself or its descendants, or below the third level.
  const descendants = (id: string): Set<string> => {
    const out = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of categories)
        if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
          out.add(c.id);
          grew = true;
        }
    }
    return out;
  };
  const subtreeHeight = (id: string) => {
    const ids = descendants(id);
    const self = categories.find((c) => c.id === id)!;
    return Math.max(...categories.filter((c) => ids.has(c.id)).map((c) => c.depth)) - self.depth;
  };
  const parentOptions = (current?: AdminCategoryDto) => {
    const blocked = current ? descendants(current.id) : new Set<string>();
    const height = current ? subtreeHeight(current.id) : 0;
    return categories.filter((c) => !blocked.has(c.id) && c.depth + 1 + height <= MAX_DEPTH);
  };

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    const payload = {
      ...d,
      parentId: d.parentId || null,
      sortOrder: Number(d.sortOrder) || 0,
      slug: d.slug.trim(),
    };
    const parsed = categoryInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing.category) await api.put(`/admin/categories/${editing.category.id}`, payload);
      else await api.post('/admin/categories', payload);
      toast({ title: editing.category ? 'Category saved' : 'Category added', variant: 'success' });
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setFormError(err.message);
      } else setFormError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (id: string | null) => categories.find((c) => c.id === id)?.name;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => open()}>
          <Plus size={16} aria-hidden="true" /> Add category
        </Button>
      </div>
      <AdminTable label="Categories">
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            <th scope="col" className={th}>
              Name
            </th>
            <th scope="col" className={th}>
              URL
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Products
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id} className="border-t border-border first:border-t-0">
              <th scope="row" className={cn(td, 'text-left font-medium')}>
                <span
                  style={{ paddingInlineStart: `${c.depth * 1.5}rem` }}
                  className="inline-flex items-center gap-2"
                >
                  {c.depth > 0 && (
                    <span aria-hidden="true" className="text-text-muted">
                      └
                    </span>
                  )}
                  {c.name}
                  {c.depth > 0 && <span className="sr-only">, in {nameOf(c.parentId)}</span>}
                </span>
              </th>
              <td className={cn(td, 'font-mono text-caption text-text-muted')}>{c.slug}</td>
              <td className={cn(td, 'text-right tabular-nums')}>{c.productCount}</td>
              <td className={td}>
                <span className="flex flex-wrap gap-1">
                  <Badge variant={c.isActive ? 'success' : 'neutral'}>
                    {c.isActive ? 'Visible' : 'Hidden'}
                  </Badge>
                  {c.isFeatured && <Badge variant="info">Featured</Badge>}
                </span>
              </td>
              <td className={cn(td, 'text-right')}>
                <span className="inline-flex gap-1">
                  {c.depth < MAX_DEPTH && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Add a subcategory to ${c.name}`}
                      onClick={() => open(undefined, c.id)}
                    >
                      <FolderPlus size={16} aria-hidden="true" />
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${c.name}`}
                    onClick={() => open(c)}
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${c.name}`}
                    onClick={() => setDeleting(c)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTable>

      <Modal
        open={Boolean(editing)}
        onClose={() => !saving && setEditing(null)}
        title={editing?.category ? `Edit ${editing.category.name}` : 'Add category'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button loading={saving} loadingText="Saving…" onClick={() => void save()}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex flex-col gap-4"
          >
            {formError && <Alert variant="error">{formError}</Alert>}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
              <FormField label="Name" required error={errors.name}>
                <Input
                  value={editing.draft.name}
                  maxLength={80}
                  onChange={(e) => set('name', e.target.value)}
                />
              </FormField>
              <FormField
                label="URL"
                hint={`/category/${editing.draft.slug || slugify(editing.draft.name) || '…'}`}
                error={errors.slug}
              >
                <Input
                  value={editing.draft.slug}
                  placeholder={slugify(editing.draft.name)}
                  maxLength={160}
                  onChange={(e) => set('slug', e.target.value)}
                />
              </FormField>
              <FormField label="Parent category" error={errors.parentId}>
                <Select
                  value={editing.draft.parentId}
                  onChange={(e) => set('parentId', e.target.value)}
                >
                  <option value="">None (top level)</option>
                  {parentOptions(editing.category).map((c) => (
                    <option key={c.id} value={c.id}>
                      {' '.repeat(c.depth)}
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label="Sort order"
                hint="Lower numbers come first"
                error={errors.sortOrder}
              >
                <Input
                  value={editing.draft.sortOrder}
                  inputMode="numeric"
                  onChange={(e) => set('sortOrder', e.target.value)}
                />
              </FormField>
            </div>
            <FormField
              label="Description"
              hint="Shown at the top of the category page"
              error={errors.description}
            >
              <Textarea
                value={editing.draft.description}
                rows={2}
                maxLength={500}
                onChange={(e) => set('description', e.target.value)}
              />
            </FormField>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
              <ImageField
                label="Image"
                hint="Square, used in category lists"
                value={editing.draft.imageUrl}
                error={errors.imageUrl}
                onChange={(v) => set('imageUrl', v)}
              />
              <ImageField
                label="Banner"
                hint="Wide, shown on the category page"
                aspect="aspect-[3/1]"
                value={editing.draft.bannerUrl}
                error={errors.bannerUrl}
                onChange={(v) => set('bannerUrl', v)}
              />
            </div>
            <div className="flex flex-col gap-3">
              <Checkbox
                label="Visible on the store"
                description="Hidden categories and their subcategories don’t appear to shoppers"
                checked={editing.draft.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
              />
              <Checkbox
                label="Featured on the homepage"
                checked={editing.draft.isFeatured}
                onChange={(e) => set('isFeatured', e.target.checked)}
              />
            </div>
            <FormField
              label="Page title for search engines"
              hint={`${editing.draft.metaTitle.length}/70`}
              error={errors.metaTitle}
            >
              <Input
                value={editing.draft.metaTitle}
                maxLength={70}
                onChange={(e) => set('metaTitle', e.target.value)}
              />
            </FormField>
            <FormField
              label="Meta description"
              hint={`${editing.draft.metaDescription.length}/160`}
              error={errors.metaDescription}
            >
              <Textarea
                value={editing.draft.metaDescription}
                rows={2}
                maxLength={160}
                onChange={(e) => set('metaDescription', e.target.value)}
              />
            </FormField>
            <FormField
              label="Buying guide text"
              hint="Optional. Shown below the products on the category page."
              error={errors.seoContent}
            >
              <Textarea
                value={editing.draft.seoContent}
                rows={4}
                maxLength={5000}
                onChange={(e) => set('seoContent', e.target.value)}
              />
            </FormField>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'category'}?`}
        description="Only empty categories can be deleted. To hide a category that has products, edit it and untick “Visible on the store”."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await api.delete(`/admin/categories/${deleting!.id}`);
          toast({ title: 'Category deleted', variant: 'success' });
          router.refresh();
        }}
      />
    </div>
  );
}
