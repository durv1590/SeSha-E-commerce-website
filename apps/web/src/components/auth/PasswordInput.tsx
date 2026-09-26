'use client';

import { Input, type InputProps } from '@seshakart/ui';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

/** Password field with a show/hide toggle (reduces typos on mobile keyboards). */
export function PasswordInput(props: Omit<InputProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-12" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-button text-text-muted hover:text-text-primary"
      >
        {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
