'use client';

import { Button, Drawer } from '@seshakart/ui';
import { SlidersHorizontal } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { FilterForm } from './FilterForm';

/** Mobile/tablet filter bottom sheet with an explicit "Show results" action. */
export function MobileFilters({
  action,
  fixed,
  activeCount,
  children,
}: {
  action: string;
  fixed?: Record<string, string>;
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="shrink-0 lg:hidden"
        aria-haspopup="dialog"
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        Filters{activeCount > 0 ? ` (${activeCount})` : ''}
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} side="bottom" title="Filters">
        <FilterForm
          id="filters-mobile"
          action={action}
          fixed={fixed}
          onApplied={() => setOpen(false)}
        >
          {children}
        </FilterForm>
      </Drawer>
    </>
  );
}
