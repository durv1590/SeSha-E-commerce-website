'use client';

import { cn } from '@seshakart/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

/**
 * Accessible hero carousel: swipe/scroll-snap with explicit previous/next controls.
 * No autoplay (WCAG 2.2.2) and slides stay reachable by keyboard and screen reader.
 */
export function HeroCarousel({ slides, labels }: { slides: ReactNode[]; labels: string[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = (i + slides.length) % slides.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setIndex(next);
  };

  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured offers"
    >
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) =>
          setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))
        }
      >
        {slides.map((slide, i) => (
          <div
            key={labels[i]}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}: ${labels[i]}`}
            className="flex w-full shrink-0 snap-start"
          >
            {slide}
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2 md:bottom-5 md:right-5">
          <div className="mr-1 flex gap-1.5" aria-hidden="true">
            {slides.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-pill bg-text-inverse/50 transition-all',
                  i === index ? 'w-5 bg-text-inverse' : 'w-1.5',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous offer"
            className="grid size-10 place-items-center rounded-pill bg-surface/90 text-navy shadow-sm hover:bg-surface"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next offer"
            className="grid size-10 place-items-center rounded-pill bg-surface/90 text-navy shadow-sm hover:bg-surface"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
