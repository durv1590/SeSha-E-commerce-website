'use client';

import type { ImageDto } from '@seshakart/types';
import { Modal, cn } from '@seshakart/ui';
import { Expand } from 'lucide-react';
import Image from 'next/image';
import { useState, type MouseEvent } from 'react';

type GalleryImage = ImageDto & { id: string };

/**
 * Product gallery: main image with hover zoom (fine pointers), thumbnail strip,
 * and a full-screen lightbox. The first image is the LCP element and loads eagerly.
 * The parent re-keys this component when the variant changes, resetting to image 1.
 */
export function ProductGallery({
  images,
  name,
  preferIds,
}: {
  images: GalleryImage[];
  name: string;
  preferIds?: string[];
}) {
  const ordered = preferIds?.length
    ? [
        ...images.filter((i) => preferIds.includes(i.id)),
        ...images.filter((i) => !preferIds.includes(i.id)),
      ]
    : images;
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [lightbox, setLightbox] = useState(false);

  if (ordered.length === 0) {
    return (
      <div
        className="aspect-square rounded-card border border-border bg-surface-muted"
        role="img"
        aria-label="Image coming soon"
      />
    );
  }
  const current = ordered[Math.min(active, ordered.length - 1)]!;

  const onMove = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row-reverse">
      <button
        type="button"
        onClick={() => setLightbox(true)}
        onMouseMove={onMove}
        onMouseLeave={() => setZoom(null)}
        aria-label={`Open full-size image: ${current.alt}`}
        className="group relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-card border border-border bg-surface"
      >
        <Image
          src={current.url}
          alt={current.alt}
          fill
          priority={active === 0}
          sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 640px"
          className="object-contain p-4 transition-transform duration-base ease-standard motion-reduce:transition-none"
          style={
            zoom ? { transform: 'scale(1.8)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined
          }
        />
        <span
          className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-pill bg-surface/90 text-text-secondary shadow-xs"
          aria-hidden="true"
        >
          <Expand size={16} />
        </span>
      </button>

      {ordered.length > 1 && (
        <ul
          className="flex gap-2 overflow-x-auto md:w-20 md:shrink-0 md:flex-col md:overflow-visible"
          aria-label="Product images"
        >
          {ordered.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1} of ${ordered.length}`}
                aria-pressed={i === active}
                className={cn(
                  'relative block size-16 overflow-hidden rounded-md border-2 bg-surface md:size-20',
                  i === active ? 'border-primary' : 'border-border hover:border-border-strong',
                )}
              >
                <Image src={img.url} alt="" fill sizes="80px" className="object-contain p-1" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={lightbox} onClose={() => setLightbox(false)} title={name} size="lg">
        <div className="relative aspect-square w-full">
          <Image
            src={current.url}
            alt={current.alt}
            fill
            sizes="(max-width: 767px) 100vw, 768px"
            className="object-contain"
          />
        </div>
        {ordered.length > 1 && (
          <div className="mt-3 flex justify-center gap-2">
            {ordered.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1}`}
                aria-pressed={i === active}
                className={cn(
                  'size-3 rounded-pill',
                  i === active ? 'bg-primary' : 'bg-border-strong',
                )}
              />
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
