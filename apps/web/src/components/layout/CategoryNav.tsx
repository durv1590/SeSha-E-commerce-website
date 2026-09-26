import type { CategoryNode } from '@seshakart/types';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';

/**
 * Desktop category navigation (≥ 1024 px). Top-level categories with a hover/focus
 * dropdown of sub-categories — pure CSS (:hover / :focus-within), no JavaScript.
 * Driven entirely by the admin-managed category tree.
 */
export function CategoryNav({ tree }: { tree: CategoryNode[] }) {
  if (tree.length === 0) return null;
  return (
    <nav aria-label="Categories" className="hidden border-t border-border lg:block">
      <ul className="container-page relative flex items-center gap-1">
        {tree.map((root) => (
          <li key={root.id} className="group">
            <Link
              href={`/category/${root.slug}`}
              className="flex min-h-11 items-center gap-1 rounded-sm px-3 text-nav text-text-primary no-underline hover:text-primary"
            >
              {root.name}
              {root.children.length > 0 && (
                <ChevronDown size={14} aria-hidden="true" className="text-text-muted" />
              )}
            </Link>
            {/* Full-width panel anchored to the nav container, so it is always on screen;
                display:none until opened, so a closed menu never widens the page. */}
            {root.children.length > 0 && (
              <div className="absolute inset-x-gutter top-full z-dropdown hidden rounded-b-md border border-border bg-surface p-6 shadow-lg animate-fade-in group-focus-within:block group-hover:block">
                <ul className="grid grid-cols-4 gap-6 xl:grid-cols-5">
                  {root.children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={`/category/${child.slug}`}
                        className="text-small font-semibold text-text-primary no-underline hover:text-primary"
                      >
                        {child.name}
                      </Link>
                      {child.children.length > 0 && (
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {child.children.map((g) => (
                            <li key={g.id}>
                              <Link
                                href={`/category/${g.slug}`}
                                className="text-small text-text-secondary no-underline hover:text-primary"
                              >
                                {g.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
        {[
          ['/deals', 'Deals'],
          ['/new-arrivals', 'New arrivals'],
          ['/best-sellers', 'Best sellers'],
        ].map(([href, label]) => (
          <li key={href}>
            <Link
              href={href!}
              className="flex min-h-11 items-center px-3 text-nav font-semibold text-accent-text no-underline hover:text-primary"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
