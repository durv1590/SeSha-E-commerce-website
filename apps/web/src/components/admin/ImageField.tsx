'use client';

import type { MediaUploadDto } from '@seshakart/types';
import { Button } from '@seshakart/ui';
import { ImagePlus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { api } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';

/** One uploaded image (logo, category image, banner) stored as its URL. */
export function ImageField({
  label,
  hint,
  value,
  onChange,
  error,
  aspect = 'aspect-square',
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  error?: string;
  aspect?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const message = problem ?? error;
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="text-small font-medium">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`relative block w-24 overflow-hidden rounded-sm border border-border bg-surface-muted ${aspect}`}
        >
          {value && <Image src={value} alt="" fill sizes="96px" className="object-contain" />}
        </span>
        <div className="flex flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setProblem(null);
              try {
                onChange((await api.upload<MediaUploadDto>('/admin/media', file)).url);
              } catch (err) {
                setProblem(err instanceof ApiError ? err.message : 'Upload failed.');
              } finally {
                setBusy(false);
                e.target.value = '';
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            loading={busy}
            loadingText="Uploading…"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={14} aria-hidden="true" />{' '}
            {value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          </Button>
          {value && (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange('')}>
              <Trash2 size={14} aria-hidden="true" /> Remove {label.toLowerCase()}
            </Button>
          )}
        </div>
      </div>
      {hint && !message && <p className="text-caption text-text-muted">{hint}</p>}
      {message && (
        <p className="text-caption font-medium text-error-text" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
