'use client';

import type { AdminBannerDto } from '@seshakart/types';
import { Badge, Button, Checkbox, FormField, Input, Select, useToast } from '@seshakart/ui';
import { BANNER_THEMES, bannerInputSchema } from '@seshakart/validation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { fromLocalInput, shortDateTime, toLocalInput } from '@/lib/admin/time';
import { ConfirmDialog } from '../ConfirmDialog';
import { FormDialog } from '../FormDialog';
import { ImageField } from '../ImageField';

const PLACEMENTS: { value: AdminBannerDto['placement']; label: string; hint: string }[] = [
  {
    value: 'HOME_HERO',
    label: 'Homepage hero',
    hint: 'Large slides at the top of the homepage (up to 5 show)',
  },
  {
    value: 'HOME_PROMO',
    label: 'Homepage offers',
    hint: 'Offer cards below the hero (up to 4 show)',
  },
  { value: 'CATEGORY_TOP', label: 'Category pages', hint: 'Shown above category listings' },
];
const THEME_LABELS: Record<(typeof BANNER_THEMES)[number], string> = {
  PRIMARY: 'Blue',
  NAVY: 'Navy',
  ACCENT: 'Amber',
  LIGHT: 'Light',
};
const STATE: Record<
  AdminBannerDto['state'],
  { label: string; badge: 'success' | 'info' | 'neutral' }
> = {
  live: { label: 'Showing', badge: 'success' },
  scheduled: { label: 'Scheduled', badge: 'info' },
  ended: { label: 'Ended', badge: 'neutral' },
  off: { label: 'Off', badge: 'neutral' },
};

type Draft = Record<
  | 'title'
  | 'subtitle'
  | 'ctaLabel'
  | 'link'
  | 'imageDesktop'
  | 'imageTablet'
  | 'imageMobile'
  | 'imageAlt'
  | 'startsAt'
  | 'endsAt'
  | 'priority',
  string
> & { placement: AdminBannerDto['placement']; theme: AdminBannerDto['theme']; isActive: boolean };

const toDraft = (
  b?: AdminBannerDto,
  placement: AdminBannerDto['placement'] = 'HOME_HERO',
): Draft => ({
  title: b?.title ?? '',
  subtitle: b?.subtitle ?? '',
  ctaLabel: b?.ctaLabel ?? '',
  link: b?.link ?? '',
  imageDesktop: b?.imageDesktop ?? '',
  imageTablet: b?.imageTablet ?? '',
  imageMobile: b?.imageMobile ?? '',
  imageAlt: b?.imageAlt ?? '',
  startsAt: toLocalInput(b?.startsAt ?? null),
  endsAt: toLocalInput(b?.endsAt ?? null),
  priority: String(b?.priority ?? 0),
  placement: b?.placement ?? placement,
  theme: b?.theme ?? 'PRIMARY',
  isActive: b?.isActive ?? true,
});

/** Banners by placement: add, edit, schedule, switch off and delete. */
export function BannerManager({ banners }: { banners: AdminBannerDto[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<{ banner?: AdminBannerDto; d: Draft } | null>(null);
  const [deleting, setDeleting] = useState<AdminBannerDto | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setEditing((e) => (e ? { ...e, d: { ...e.d, [k]: v } } : e));
  const d = editing?.d;

  return (
    <div className="flex flex-col gap-6">
      {PLACEMENTS.map((pl) => {
        const list = banners.filter((b) => b.placement === pl.value);
        return (
          <section
            key={pl.value}
            aria-labelledby={`pl-${pl.value}`}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id={`pl-${pl.value}`} className="text-h4">
                  {pl.label}
                </h2>
                <p className="text-small text-text-muted">
                  {pl.hint}. Higher priority shows first.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing({ d: toDraft(undefined, pl.value) })}
              >
                <Plus size={14} aria-hidden="true" /> Add
                <span className="sr-only"> {pl.label.toLowerCase()} banner</span>
              </Button>
            </div>
            {list.length === 0 ? (
              <p className="rounded-card border border-dashed border-border p-4 text-small text-text-muted">
                No banners yet.
              </p>
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
                {list.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
                  >
                    <div className="relative aspect-[3/1] overflow-hidden rounded-sm bg-surface-muted">
                      {(b.imageDesktop ?? b.imageMobile) && (
                        <Image
                          src={(b.imageDesktop ?? b.imageMobile)!}
                          alt=""
                          fill
                          sizes="(min-width: 1280px) 30vw, 90vw"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{b.title}</p>
                        {b.subtitle && (
                          <p className="line-clamp-2 text-small text-text-secondary">
                            {b.subtitle}
                          </p>
                        )}
                        <p className="mt-1 text-caption text-text-muted">
                          Priority {b.priority}
                          {b.link && ` · → ${b.link}`}
                          {b.startsAt && ` · from ${shortDateTime(b.startsAt)}`}
                          {b.endsAt && ` · until ${shortDateTime(b.endsAt)}`}
                        </p>
                      </div>
                      <Badge variant={STATE[b.state].badge}>{STATE[b.state].label}</Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing({ banner: b, d: toDraft(b) })}
                      >
                        <Pencil size={14} aria-hidden="true" /> Edit
                        <span className="sr-only"> {b.title}</span>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(b)}>
                        <Trash2 size={14} aria-hidden="true" /> Delete
                        <span className="sr-only"> {b.title}</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.banner ? `Edit “${editing.banner.title}”` : 'Add banner'}
        submitLabel="Save"
        onSubmit={async () => {
          if (!editing) return;
          const x = editing.d;
          const payload = {
            ...x,
            priority: /^\d+$/.test(x.priority) ? Number(x.priority) : -1,
            startsAt: fromLocalInput(x.startsAt),
            endsAt: fromLocalInput(x.endsAt),
          };
          const parsed = bannerInputSchema.safeParse(payload);
          if (!parsed.success)
            return Object.fromEntries(
              parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
            );
          if (editing.banner) await api.put(`/admin/banners/${editing.banner.id}`, payload);
          else await api.post('/admin/banners', payload);
          toast({ title: 'Banner saved', variant: 'success' });
          router.refresh();
        }}
      >
        {(e) =>
          d && (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                <FormField label="Where" required error={e.placement}>
                  <Select
                    name="placement"
                    value={d.placement}
                    onChange={(ev) => set('placement', ev.target.value as Draft['placement'])}
                  >
                    {PLACEMENTS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField
                  label="Colour"
                  hint="Used behind text when there’s no image"
                  error={e.theme}
                >
                  <Select
                    name="theme"
                    value={d.theme}
                    onChange={(ev) => set('theme', ev.target.value as Draft['theme'])}
                  >
                    {BANNER_THEMES.map((t) => (
                      <option key={t} value={t}>
                        {THEME_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <FormField label="Heading" required error={e.title}>
                <Input
                  name="title"
                  value={d.title}
                  maxLength={80}
                  onChange={(ev) => set('title', ev.target.value)}
                />
              </FormField>
              <FormField label="Text" error={e.subtitle}>
                <Input
                  name="subtitle"
                  value={d.subtitle}
                  maxLength={160}
                  onChange={(ev) => set('subtitle', ev.target.value)}
                />
              </FormField>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                <FormField label="Button text" hint="e.g. Shop now" error={e.ctaLabel}>
                  <Input
                    name="ctaLabel"
                    value={d.ctaLabel}
                    maxLength={30}
                    onChange={(ev) => set('ctaLabel', ev.target.value)}
                  />
                </FormField>
                <FormField
                  label="Link"
                  hint="A page like /deals or an https:// link"
                  error={e.link}
                >
                  <Input
                    name="link"
                    value={d.link}
                    maxLength={500}
                    onChange={(ev) => set('link', ev.target.value)}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-3">
                <ImageField
                  label="Desktop image"
                  hint="Wide, e.g. 1600 × 500"
                  aspect="aspect-[3/1]"
                  value={d.imageDesktop}
                  error={e.imageDesktop}
                  onChange={(v) => set('imageDesktop', v)}
                />
                <ImageField
                  label="Tablet image"
                  hint="Optional"
                  aspect="aspect-[2/1]"
                  value={d.imageTablet}
                  error={e.imageTablet}
                  onChange={(v) => set('imageTablet', v)}
                />
                <ImageField
                  label="Mobile image"
                  hint="Optional, e.g. 800 × 800"
                  value={d.imageMobile}
                  error={e.imageMobile}
                  onChange={(v) => set('imageMobile', v)}
                />
              </div>
              <FormField
                label="Image description"
                hint="What the image shows, for screen readers"
                error={e.imageAlt}
              >
                <Input
                  name="imageAlt"
                  value={d.imageAlt}
                  maxLength={160}
                  onChange={(ev) => set('imageAlt', ev.target.value)}
                />
              </FormField>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-3">
                <FormField label="Show from" hint="India time; blank = now" error={e.startsAt}>
                  <Input
                    name="startsAt"
                    type="datetime-local"
                    value={d.startsAt}
                    onChange={(ev) => set('startsAt', ev.target.value)}
                  />
                </FormField>
                <FormField label="Show until" hint="Blank = no end" error={e.endsAt}>
                  <Input
                    name="endsAt"
                    type="datetime-local"
                    value={d.endsAt}
                    onChange={(ev) => set('endsAt', ev.target.value)}
                  />
                </FormField>
                <FormField label="Priority" hint="0–1000" error={e.priority}>
                  <Input
                    name="priority"
                    value={d.priority}
                    inputMode="numeric"
                    onChange={(ev) => set('priority', ev.target.value)}
                  />
                </FormField>
              </div>
              <Checkbox
                label="Active"
                checked={d.isActive}
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
        description="To hide it temporarily, edit it and untick Active instead."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await api.delete(`/admin/banners/${deleting!.id}`);
          toast({ title: 'Banner deleted', variant: 'success' });
          router.refresh();
        }}
      />
    </div>
  );
}
