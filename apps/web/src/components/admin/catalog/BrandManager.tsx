'use client';

import type { AdminBrandDto } from '@seshakart/types';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  Textarea,
  cn,
  useToast,
} from '@seshakart/ui';
import { brandInputSchema, slugify } from '@seshakart/validation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { AdminTable, td, th } from '../AdminTable';
import { ConfirmDialog } from '../ConfirmDialog';
import { ImageField } from '../ImageField';

interface Draft {
  name: string;
  slug: string;
  description: string;
  logoUrl: string;
  isActive: boolean;
  isFeatured: boolean;
  metaTitle: string;
  metaDescription: string;
}

const toDraft = (b?: AdminBrandDto): Draft => ({
  name: b?.name ?? '',
  slug: b?.slug ?? '',
  description: b?.description ?? '',
  logoUrl: b?.logoUrl ?? '',
  isActive: b?.isActive ?? true,
  isFeatured: b?.isFeatured ?? false,
  metaTitle: b?.metaTitle ?? '',
  metaDescription: b?.metaDescription ?? '',
});

export function BrandManager({ brands }: { brands: AdminBrandDto[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<{ brand?: AdminBrandDto; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<AdminBrandDto | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = (brand?: AdminBrandDto) => {
    setErrors({});
    setFormError(null);
    setEditing({ brand, draft: toDraft(brand) });
  };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  const save = async () => {
    if (!editing) return;
    const payload = { ...editing.draft, slug: editing.draft.slug.trim() };
    const parsed = brandInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing.brand) await api.put(`/admin/brands/${editing.brand.id}`, payload);
      else await api.post('/admin/brands', payload);
      toast({ title: editing.brand ? 'Brand saved' : 'Brand added', variant: 'success' });
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => open()}>
          <Plus size={16} aria-hidden="true" /> Add brand
        </Button>
      </div>
      <AdminTable label="Brands">
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            <th scope="col" className={th}>
              Brand
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
          {brands.map((b) => (
            <tr key={b.id} className="border-t border-border first:border-t-0">
              <th scope="row" className={cn(td, 'text-left font-medium')}>
                <span className="flex items-center gap-3">
                  <span className="relative block size-9 shrink-0 overflow-hidden rounded-sm border border-border bg-surface">
                    {b.logoUrl && (
                      <Image
                        src={b.logoUrl}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-contain p-0.5"
                      />
                    )}
                  </span>
                  {b.name}
                </span>
              </th>
              <td className={cn(td, 'font-mono text-caption text-text-muted')}>{b.slug}</td>
              <td className={cn(td, 'text-right tabular-nums')}>{b.productCount}</td>
              <td className={td}>
                <span className="flex flex-wrap gap-1">
                  <Badge variant={b.isActive ? 'success' : 'neutral'}>
                    {b.isActive ? 'Visible' : 'Hidden'}
                  </Badge>
                  {b.isFeatured && <Badge variant="info">Featured</Badge>}
                </span>
              </td>
              <td className={cn(td, 'text-right')}>
                <span className="inline-flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${b.name}`}
                    onClick={() => open(b)}
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${b.name}`}
                    onClick={() => setDeleting(b)}
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
        title={editing?.brand ? `Edit ${editing.brand.name}` : 'Add brand'}
        size="md"
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
            <FormField label="Name" required error={errors.name}>
              <Input
                value={editing.draft.name}
                maxLength={80}
                onChange={(e) => set('name', e.target.value)}
              />
            </FormField>
            <FormField
              label="URL"
              hint={`/brand/${editing.draft.slug || slugify(editing.draft.name) || '…'}`}
              error={errors.slug}
            >
              <Input
                value={editing.draft.slug}
                placeholder={slugify(editing.draft.name)}
                maxLength={160}
                onChange={(e) => set('slug', e.target.value)}
              />
            </FormField>
            <ImageField
              label="Logo"
              value={editing.draft.logoUrl}
              error={errors.logoUrl}
              onChange={(v) => set('logoUrl', v)}
            />
            <FormField label="Description" error={errors.description}>
              <Textarea
                value={editing.draft.description}
                rows={3}
                maxLength={500}
                onChange={(e) => set('description', e.target.value)}
              />
            </FormField>
            <Checkbox
              label="Visible on the store"
              checked={editing.draft.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
            />
            <Checkbox
              label="Featured on the homepage"
              checked={editing.draft.isFeatured}
              onChange={(e) => set('isFeatured', e.target.checked)}
            />
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
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'brand'}?`}
        description="Only brands without products can be deleted. To hide a brand, edit it and untick “Visible on the store”."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await api.delete(`/admin/brands/${deleting!.id}`);
          toast({ title: 'Brand deleted', variant: 'success' });
          router.refresh();
        }}
      />
    </div>
  );
}
