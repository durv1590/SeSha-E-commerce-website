'use client';

import { Button, useToast } from '@seshakart/ui';
import { Share2 } from 'lucide-react';

/** Native share sheet on mobile; copies the link elsewhere. */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const { toast } = useToast();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        try {
          if (navigator.share) {
            await navigator.share({ title, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          toast({ title: 'Link copied', variant: 'success' });
        } catch {
          /* share sheet dismissed */
        }
      }}
    >
      <Share2 size={16} aria-hidden="true" />
      Share
    </Button>
  );
}
