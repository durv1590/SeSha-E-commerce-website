'use client';

import type { MediaUploadDto } from '@seshakart/types';
import { Alert, Button, Input, Select, cn } from '@seshakart/ui';
import { MAX_PRODUCT_IMAGES } from '@seshakart/validation';
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { api } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { newKey, type ImageDraft, type VariantDraft } from './editor-state';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/gif';

/**
 * Product images: upload (validated and converted to WebP by the API), describe,
 * reorder (the first image is the main one) and optionally link to a variant.
 */
export function ImageManager({
  images,
  variants,
  onChange,
  errors,
}: {
  images: ImageDraft[];
  variants: VariantDraft[];
  onChange: (images: ImageDraft[]) => void;
  errors: Record<string, string>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const id = useId();
  const room = MAX_PRODUCT_IMAGES - images.length;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files].slice(0, room);
    const skipped = files.length - list.length;
    setProblems(
      skipped ? [`Only ${MAX_PRODUCT_IMAGES} images are allowed; ${skipped} skipped.`] : [],
    );
    setUploading(list.length);
    setStatus(`Uploading ${list.length} image${list.length === 1 ? '' : 's'}…`);
    const added: ImageDraft[] = [];
    const failed: string[] = [];
    for (const file of list) {
      try {
        const m = await api.upload<MediaUploadDto>('/admin/media', file);
        added.push({ key: newKey('i'), mediaId: m.id, url: m.url, alt: '', variantSku: '' });
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof ApiError ? err.message : 'Upload failed.'}`);
      }
      setUploading((n) => n - 1);
    }
    onChange([...images, ...added]);
    setProblems((p) => [...p, ...failed]);
    setStatus(
      `${added.length} image${added.length === 1 ? '' : 's'} added${failed.length ? `, ${failed.length} failed` : ''}. Add a description to each.`,
    );
    if (input.current) input.current.value = '';
  };

  const move = (from: number, to: number) => {
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
    setStatus(`Moved to position ${to + 1}${to === 0 ? ' (main image)' : ''}.`);
  };
  const update = (i: number, patch: Partial<ImageDraft>) =>
    onChange(images.map((img, j) => (j === i ? { ...img, ...patch } : img)));

  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {errors.images && <Alert variant="error">{errors.images}</Alert>}
      {problems.length > 0 && (
        <Alert variant="warning" title="Some images weren’t added">
          <ul className="list-disc pl-4">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
      {images.length > 0 && (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {images.map((img, i) => {
            const altError = errors[`images.${i}.alt`] ?? errors[`images.${i}`];
            return (
              <li
                key={img.key}
                className={cn(
                  'flex flex-col gap-2 rounded-card border bg-surface p-2',
                  i === 0 ? 'border-primary' : 'border-border',
                )}
              >
                <div className="relative aspect-square overflow-hidden rounded-sm bg-surface-muted">
                  <Image src={img.url} alt="" fill sizes="176px" className="object-contain" />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded-xs bg-primary px-1.5 py-0.5 text-caption font-semibold text-text-inverse">
                      Main
                    </span>
                  )}
                </div>
                <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
                  Description (alt text)
                  <Input
                    size="sm"
                    value={img.alt}
                    maxLength={200}
                    name={`images.${i}.alt`}
                    aria-invalid={altError ? true : undefined}
                    aria-describedby={altError ? `${id}-alt-${i}` : undefined}
                    placeholder="e.g. Black earbuds in open case"
                    onChange={(e) => update(i, { alt: e.target.value })}
                  />
                </label>
                {altError && (
                  <p id={`${id}-alt-${i}`} className="text-caption font-medium text-error-text">
                    {altError}
                  </p>
                )}
                {variants.length > 1 && (
                  <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
                    Show for variant
                    <Select
                      size="sm"
                      value={img.variantSku}
                      name={`images.${i}.variantSku`}
                      onChange={(e) => update(i, { variantSku: e.target.value })}
                    >
                      <option value="">All variants</option>
                      {variants
                        .filter((v) => v.sku.trim())
                        .map((v) => (
                          <option key={v.key} value={v.sku.trim().toUpperCase()}>
                            {v.name || v.sku}
                          </option>
                        ))}
                    </Select>
                  </label>
                )}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={i === 0}
                      aria-label={`Move image ${i + 1} earlier`}
                      onClick={() => move(i, i - 1)}
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={i === images.length - 1}
                      aria-label={`Move image ${i + 1} later`}
                      onClick={() => move(i, i + 1)}
                    >
                      <ArrowRight size={16} aria-hidden="true" />
                    </Button>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove image ${i + 1}`}
                    onClick={() => {
                      onChange(images.filter((_, j) => j !== i));
                      setStatus(`Image ${i + 1} removed.`);
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={`${id}-file`}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          disabled={room <= 0 || uploading > 0}
          onChange={(e) => void upload(e.target.files)}
        />
        <Button
          variant="outline"
          disabled={room <= 0}
          loading={uploading > 0}
          loadingText={`Uploading (${uploading} left)…`}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={16} aria-hidden="true" /> Add images
        </Button>
        <p className="text-caption text-text-muted">
          JPEG, PNG, WebP, AVIF or GIF, up to 8 MB, at least 200 × 200 px. Square images of 1000 ×
          1000 px or more look best. {images.length}/{MAX_PRODUCT_IMAGES} used.
        </p>
      </div>
    </div>
  );
}
