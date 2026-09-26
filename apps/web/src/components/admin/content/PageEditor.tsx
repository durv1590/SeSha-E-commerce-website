'use client';

import type { AdminPageDto } from '@seshakart/types';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FormField,
  Input,
  Textarea,
  useToast,
} from '@seshakart/ui';
import { pageInputSchema, slugify } from '@seshakart/validation';
import { ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { Markdown } from '@/lib/content/markdown';
import { ConfirmDialog } from '../ConfirmDialog';

const HELP = [
  ['## Heading', 'Section heading'],
  ['### Smaller heading', 'Sub-heading'],
  ['- item', 'Bullet list'],
  ['1. item', 'Numbered list'],
  ['**bold**', 'Bold'],
  ['_italic_', 'Italic'],
  ['[text](/pages/contact-us)', 'Link'],
];

/** Write a CMS page in simple formatting with a live preview; publish when ready. */
export function PageEditor({ page }: { page: AdminPageDto | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const initial = {
    title: page?.title ?? '',
    slug: page?.slug ?? '',
    content: page?.content ?? '',
    metaTitle: page?.metaTitle ?? '',
    metaDescription: page?.metaDescription ?? '',
    isPublished: page?.isPublished ?? false,
  };
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setMessage(null);
    const parsed = pageInputSchema.safeParse(v);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setSaving(true);
    try {
      const saved = page
        ? await api.put<AdminPageDto>(`/admin/pages/${page.id}`, v)
        : await api.post<AdminPageDto>('/admin/pages', v);
      setErrors({});
      toast({
        title: saved.isPublished ? 'Page saved and live' : 'Draft saved',
        variant: 'success',
      });
      if (page) router.refresh();
      else router.replace(`/admin/content/pages/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setMessage(err.message);
      } else setMessage('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const slug = v.slug || slugify(v.title) || 'page-url';
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/content/pages"
          className="self-start text-small font-medium text-primary-dark"
        >
          ← All pages
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h2">{page ? page.title : 'New page'}</h1>
            {page && (
              <Badge variant={page.isPublished ? 'success' : 'neutral'}>
                {page.isPublished ? 'Published' : 'Draft'}
              </Badge>
            )}
            {dirty && <span className="text-small text-warning-text">Unsaved changes</span>}
          </div>
          <div className="flex gap-2">
            {page?.isPublished && (
              <a
                href={`/pages/${page.slug}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 self-center text-small font-medium text-primary-dark"
              >
                View page <ExternalLink size={14} aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            <Button
              type="submit"
              loading={saving}
              loadingText="Saving…"
              disabled={Boolean(page) && !dirty}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
      {message && <Alert variant="error">{message}</Alert>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
            <FormField label="Title" required error={errors.title}>
              <Input
                name="title"
                value={v.title}
                maxLength={120}
                onChange={(e) => set('title', e.target.value)}
              />
            </FormField>
            <FormField label="URL" hint={`seshakart.com/pages/${slug}`} error={errors.slug}>
              <Input
                name="slug"
                value={v.slug}
                placeholder={slugify(v.title)}
                maxLength={160}
                onChange={(e) => set('slug', e.target.value)}
              />
            </FormField>
          </div>
          <div role="tablist" aria-label="Content view" className="flex gap-1">
            {(['write', 'preview'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`panel-${t}`}
                onClick={() => setTab(t)}
                className={
                  tab === t
                    ? 'rounded-sm bg-navy px-3 py-1.5 text-small font-medium text-text-inverse'
                    : 'rounded-sm px-3 py-1.5 text-small font-medium text-text-primary hover:bg-surface-muted'
                }
              >
                {t === 'write' ? 'Write' : 'Preview'}
              </button>
            ))}
          </div>
          {tab === 'write' ? (
            <div role="tabpanel" id="panel-write" aria-labelledby="tab-write">
              <FormField label="Content" hideLabel error={errors.content}>
                <Textarea
                  name="content"
                  value={v.content}
                  rows={22}
                  maxLength={50000}
                  className="font-mono text-small"
                  onChange={(e) => set('content', e.target.value)}
                />
              </FormField>
            </div>
          ) : (
            <div
              role="tabpanel"
              id="panel-preview"
              aria-labelledby="tab-preview"
              tabIndex={0}
              className="min-h-64 rounded-md border border-border p-4"
            >
              <h2 className="text-h2">{v.title || 'Untitled'}</h2>
              {v.content.trim() ? (
                <Markdown source={v.content} className="cms-content mt-4" />
              ) : (
                <p className="mt-4 text-text-muted">Nothing written yet.</p>
              )}
            </div>
          )}
        </div>

        <aside aria-label="Page settings" className="flex flex-col gap-4">
          <section
            aria-labelledby="pub-h"
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          >
            <h2 id="pub-h" className="text-h5">
              Visibility
            </h2>
            <Checkbox
              label="Published"
              description="Published pages appear in the footer under Help & policies"
              checked={v.isPublished}
              onChange={(e) => set('isPublished', e.target.checked)}
            />
            {page && (
              <Button
                variant="ghost"
                className="self-start text-error-text"
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={16} aria-hidden="true" /> Delete page
              </Button>
            )}
          </section>
          <section
            aria-labelledby="seo-h"
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          >
            <h2 id="seo-h" className="text-h5">
              Search engines
            </h2>
            <FormField
              label="Page title"
              hint={`${v.metaTitle.length}/70`}
              error={errors.metaTitle}
            >
              <Input
                name="metaTitle"
                value={v.metaTitle}
                maxLength={70}
                placeholder={v.title}
                onChange={(e) => set('metaTitle', e.target.value)}
              />
            </FormField>
            <FormField
              label="Description"
              hint={`${v.metaDescription.length}/160`}
              error={errors.metaDescription}
            >
              <Textarea
                name="metaDescription"
                value={v.metaDescription}
                rows={3}
                maxLength={160}
                onChange={(e) => set('metaDescription', e.target.value)}
              />
            </FormField>
          </section>
          <section
            aria-labelledby="fmt-h"
            className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4"
          >
            <h2 id="fmt-h" className="text-h5">
              Formatting
            </h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-small">
              {HELP.map(([code, label]) => (
                <div key={code} className="contents">
                  <dt>
                    <code className="font-mono text-caption">{code}</code>
                  </dt>
                  <dd className="text-text-secondary">{label}</dd>
                </div>
              ))}
            </dl>
            <p className="text-caption text-text-muted">Leave a blank line between paragraphs.</p>
          </section>
        </aside>
      </div>

      {page && (
        <ConfirmDialog
          open={deleting}
          onClose={() => setDeleting(false)}
          title={`Delete “${page.title}”?`}
          description="Links to this page will stop working. To hide it, untick Published instead."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await api.delete(`/admin/pages/${page.id}`);
            toast({ title: 'Page deleted', variant: 'success' });
            router.replace('/admin/content/pages');
            router.refresh();
          }}
        />
      )}
    </form>
  );
}
