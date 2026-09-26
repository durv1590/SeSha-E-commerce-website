'use client';

import type { PopularSearches, SearchSuggestions } from '@seshakart/types';
import { cn, formatINR } from '@seshakart/ui';
import { Clock, Search, Tag, TrendingUp, X } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { addRecent, clearRecent, readRecent } from './recent-searches';

const DEBOUNCE_MS = 180;
const MAX_LENGTH = 100;

interface Option {
  key: string;
  label: string;
  /** Where choosing the option goes; queries go to /search. */
  href: string;
  /** A search term (remembered as a recent search when chosen). */
  query?: string;
  icon?: ReactNode;
  image?: { url: string; alt: string } | null;
  detail?: string;
}

interface Group {
  key: string;
  label: string;
  options: Option[];
}

const searchHref = (q: string) => `/search?q=${encodeURIComponent(q)}`;
const termOption = (group: string, q: string, icon: ReactNode): Option => ({
  key: `${group}:${q}`,
  label: q,
  href: searchHref(q),
  query: q,
  icon,
});

/**
 * Header search: an ARIA 1.2 combobox with a listbox popup.
 * - Works without JavaScript (a plain GET form to /search).
 * - Empty field: recent searches (this browser only), trending and popular searches.
 * - Typing: debounced suggestions (search terms, categories, brands, products).
 * - Keyboard: ↑/↓ move, Enter chooses (or searches), Escape closes then clears; the
 *   popup closes when focus leaves the search.
 * Focus never leaves the input; the active option is conveyed with aria-activedescendant.
 */
export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const uid = useId();
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const [popular, setPopular] = useState<PopularSearches | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestions | null>(null);
  const [loading, setLoading] = useState(false);

  // Mirror the current search in the field on the results page.
  const currentQuery = pathname === '/search' ? (params.get('q') ?? '') : '';
  useEffect(() => {
    setValue(currentQuery);
    setOpen(false);
  }, [currentQuery, pathname]);

  const trimmed = value.trim();

  // Debounced suggestions; stale responses are aborted.
  useEffect(() => {
    if (!open || !trimmed) {
      setSuggestions(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        setSuggestions(((await res.json()) as { data: SearchSuggestions }).data);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setSuggestions(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, open]);

  const loadIdle = useCallback(() => {
    setRecent(readRecent());
    if (popular) return;
    fetch('/api/search/popular')
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data: PopularSearches } | null) => body && setPopular(body.data))
      .catch(() => undefined);
  }, [popular]);

  const groups = useMemo<Group[]>(() => {
    if (!trimmed) {
      const seen = new Set(recent.map((r) => r.toLowerCase()));
      const fresh = (list: string[] = []) =>
        list.filter((q) => {
          const k = q.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      return [
        {
          key: 'recent',
          label: 'Recent searches',
          options: recent.map((q) => termOption('recent', q, <Clock size={16} />)),
        },
        {
          key: 'trending',
          label: 'Trending',
          options: fresh(popular?.trending).map((q) =>
            termOption('trending', q, <TrendingUp size={16} />),
          ),
        },
        {
          key: 'popular',
          label: 'Popular searches',
          options: fresh(popular?.popular).map((q) =>
            termOption('popular', q, <Search size={16} />),
          ),
        },
      ].filter((g) => g.options.length > 0);
    }
    const s = suggestions;
    const terms = [trimmed, ...(s?.queries ?? []).filter((q) => q !== trimmed.toLowerCase())];
    return [
      {
        key: 'terms',
        label: 'Search for',
        options: terms.map((q) => termOption('term', q, <Search size={16} />)),
      },
      {
        key: 'categories',
        label: 'Categories',
        options: (s?.categories ?? []).map((c) => ({
          key: `category:${c.slug}`,
          label: c.name,
          href: `/category/${c.slug}`,
          icon: <Tag size={16} />,
        })),
      },
      {
        key: 'brands',
        label: 'Brands',
        options: (s?.brands ?? []).map((b) => ({
          key: `brand:${b.slug}`,
          label: b.name,
          href: `/brand/${b.slug}`,
          detail: 'Brand',
        })),
      },
      {
        key: 'products',
        label: 'Products',
        options: (s?.products ?? []).map((p) => ({
          key: `product:${p.slug}`,
          label: p.name,
          href: `/product/${p.slug}`,
          image: p.image,
          detail: formatINR(p.price),
        })),
      },
    ].filter((g) => g.options.length > 0);
  }, [trimmed, recent, popular, suggestions]);

  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const expanded = open && flat.length > 0;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  // Keep the active option in range as suggestions change.
  useEffect(() => setActive(-1), [trimmed, suggestions]);

  // Close when focus or a pointer goes elsewhere.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => {
    if (active >= 0) {
      document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    }
    // optionId is derived from a stable id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const go = (option: Option) => {
    if (option.query) setRecent(addRecent(option.query));
    setOpen(false);
    setActive(-1);
    if (option.query) setValue(option.query);
    inputRef.current?.blur();
    router.push(option.href);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (expanded && active >= 0) return go(flat[active]!);
    if (!trimmed) return inputRef.current?.focus();
    go({ key: 'submit', label: trimmed, href: searchHref(trimmed), query: trimmed });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          loadIdle();
          return;
        }
        if (flat.length) setActive((i) => (i + 1) % flat.length);
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          loadIdle();
          return;
        }
        if (flat.length) setActive((i) => (i <= 0 ? flat.length - 1 : i - 1));
        return;
      case 'Escape':
        if (expanded) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
        } else if (value) {
          e.preventDefault();
          setValue('');
        }
        return;
    }
  };

  const status = !expanded
    ? ''
    : trimmed
      ? loading
        ? ''
        : `${flat.length} suggestion${flat.length === 1 ? '' : 's'} available.`
      : `${flat.length} recent and popular search${flat.length === 1 ? '' : 'es'} available.`;

  let index = -1;
  return (
    <div
      ref={rootRef}
      className={cn('relative w-full', className)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <form role="search" action="/search" method="get" onSubmit={submit} aria-label="Products">
        <label htmlFor={`${uid}-input`} className="sr-only">
          Search products, brands and categories
        </label>
        <div className="relative">
          <Search
            size={20}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            ref={inputRef}
            id={`${uid}-input`}
            name="q"
            type="search"
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={MAX_LENGTH}
            placeholder="Search for products, brands and more"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
              if (!e.target.value.trim()) loadIdle();
            }}
            onFocus={() => {
              setOpen(true);
              loadIdle();
            }}
            onKeyDown={onKeyDown}
            className="h-11 w-full min-w-0 rounded-input border border-border-strong bg-surface-muted pl-10 pr-20 text-body text-text-primary placeholder:text-text-muted focus:border-primary focus:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {value && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setValue('');
                setOpen(true);
                loadIdle();
                inputRef.current?.focus();
              }}
              className="absolute right-11 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-text-muted hover:bg-surface-muted hover:text-text-primary"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-button bg-primary text-text-inverse hover:bg-primary-dark"
          >
            <Search size={18} aria-hidden="true" />
          </button>
        </div>
      </form>

      <div
        className={cn(
          'absolute inset-x-0 top-full z-dropdown mt-1 max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain rounded-md border border-border bg-surface py-2 shadow-lg',
          !expanded && 'hidden',
        )}
      >
        <div id={listId} role="listbox" aria-label="Search suggestions">
          {groups.map((g) => (
            <ul key={g.key} role="group" aria-labelledby={`${uid}-${g.key}`}>
              <li
                role="presentation"
                id={`${uid}-${g.key}`}
                className="px-4 pb-1 pt-2 text-caption font-semibold uppercase tracking-wide text-text-muted"
              >
                {g.label}
              </li>
              {g.options.map((o) => {
                index += 1;
                const i = index;
                return (
                  <li
                    key={o.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                    onClick={() => go(o)}
                    onMouseMove={() => i !== active && setActive(i)}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-3 px-4 py-1.5 text-body',
                      i === active && 'bg-primary-light',
                    )}
                  >
                    {o.image !== undefined ? (
                      <span className="relative size-10 shrink-0 overflow-hidden rounded-sm border border-border bg-surface">
                        {o.image && (
                          <Image
                            src={o.image.url}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-contain p-0.5"
                          />
                        )}
                      </span>
                    ) : (
                      o.icon && (
                        <span aria-hidden="true" className="shrink-0 text-text-muted">
                          {o.icon}
                        </span>
                      )
                    )}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.detail && (
                      <span className="shrink-0 text-small text-text-muted">{o.detail}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
        {!trimmed && recent.length > 0 && (
          <div className="border-t border-border px-4 pt-2">
            <button
              type="button"
              className="min-h-9 text-small font-semibold text-primary hover:underline"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                clearRecent();
                setRecent([]);
                setActive(-1);
                inputRef.current?.focus();
              }}
            >
              Clear recent searches
            </button>
          </div>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/** Server-rendered stand-in (and the no-JavaScript experience): a plain GET form. */
export function SearchBoxFallback({ className }: { className?: string }) {
  return (
    <form
      role="search"
      action="/search"
      method="get"
      aria-label="Products"
      className={cn('relative w-full', className)}
    >
      <Search
        size={20}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
      <input
        name="q"
        type="search"
        aria-label="Search products, brands and categories"
        maxLength={MAX_LENGTH}
        placeholder="Search for products, brands and more"
        className="h-11 w-full min-w-0 rounded-input border border-border-strong bg-surface-muted pl-10 pr-12 text-body placeholder:text-text-muted"
      />
      <button
        type="submit"
        aria-label="Search"
        className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-button bg-primary text-text-inverse"
      >
        <Search size={18} aria-hidden="true" />
      </button>
    </form>
  );
}
