'use client';

import { Heart, Menu, MoreVertical, ShoppingCart, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Checkbox,
  Drawer,
  DropdownMenu,
  FormField,
  Input,
  Modal,
  QuantityStepper,
  Radio,
  Select,
  Textarea,
  ToastProvider,
  Tooltip,
  useToast,
  cn,
} from '@seshakart/ui';
import { INDIAN_STATES } from '@seshakart/types';

export function WishlistDemo({ name }: { name: string }) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
      onClick={() => setOn(!on)}
      className="grid size-10 place-items-center rounded-pill bg-surface/90 text-text-secondary shadow-xs transition-colors hover:text-error"
    >
      <Heart size={20} aria-hidden="true" className={cn(on && 'fill-error text-error')} />
    </button>
  );
}

export function AddToCartDemo({ name, disabled }: { name: string; disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="accent"
      size="sm"
      fullWidth
      disabled={disabled}
      loading={loading}
      loadingText="Adding…"
      aria-label={disabled ? `${name} is out of stock` : `Add ${name} to cart`}
      onClick={() => {
        setLoading(true);
        setTimeout(() => setLoading(false), 800);
      }}
    >
      <ShoppingCart size={16} aria-hidden="true" />
      {disabled ? 'Out of stock' : 'Add to cart'}
    </Button>
  );
}

function Demos() {
  const { toast } = useToast();
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState<null | 'left' | 'right' | 'bottom'>(null);
  const [qty, setQty] = useState(1);
  const [pin, setPin] = useState('');
  const pinError = pin && !/^[1-9]\d{5}$/.test(pin) ? 'Enter a valid 6-digit PIN code' : null;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form
        className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5"
        onSubmit={(e) => e.preventDefault()}
      >
        <h3 className="text-h4">Address form</h3>
        <FormField label="Full name" required>
          <Input autoComplete="name" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mobile number" hint="10-digit Indian mobile" required>
            <Input type="tel" inputMode="numeric" autoComplete="tel-national" />
          </FormField>
          <FormField label="PIN code" error={pinError} required>
            <Input
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="postal-code"
            />
          </FormField>
        </div>
        <FormField label="State" required>
          <Select defaultValue="">
            <option value="" disabled>
              Select state
            </option>
            {INDIAN_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Delivery instructions" hint="Optional">
          <Textarea rows={3} />
        </FormField>
        <fieldset>
          <legend className="text-small font-medium">Address type</legend>
          <div className="flex flex-wrap gap-x-6">
            <Radio name="type" label="Home" defaultChecked />
            <Radio name="type" label="Work" />
          </div>
        </fieldset>
        <Checkbox label="Make this my default address" description="Used first at checkout" />
        <Button type="submit" variant="primary">
          Save address
        </Button>
      </form>

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setModal(true)}>
            Open modal
          </Button>
          <Button variant="outline" onClick={() => setDrawer('left')}>
            <Menu size={18} aria-hidden="true" /> Nav drawer
          </Button>
          <Button variant="outline" onClick={() => setDrawer('right')}>
            <ShoppingCart size={18} aria-hidden="true" /> Cart drawer
          </Button>
          <Button variant="outline" onClick={() => setDrawer('bottom')}>
            <SlidersHorizontal size={18} aria-hidden="true" /> Filter sheet
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: 'Added to cart',
                description: 'Sample Wireless Earbuds',
                variant: 'success',
                action: { label: 'View cart', onClick: () => undefined },
              })
            }
          >
            Success toast
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast({
                title: 'Coupon not valid',
                description: 'Minimum cart value is ₹999.',
                variant: 'error',
              })
            }
          >
            Error toast
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <QuantityStepper value={qty} onChange={setQty} max={5} itemLabel="sample product" />
          <Tooltip content="Prices include GST">
            <Button variant="link">Tax info</Button>
          </Tooltip>
          <DropdownMenu
            trigger={<MoreVertical size={20} aria-hidden="true" />}
            triggerLabel="Order actions"
            triggerClassName="size-control-md justify-center hover:bg-surface-muted"
            items={[
              { label: 'Track order', onSelect: () => toast({ title: 'Tracking opened' }) },
              { label: 'Download invoice', onSelect: () => toast({ title: 'Invoice downloaded' }) },
              {
                label: 'Cancel order',
                danger: true,
                onSelect: () => toast({ title: 'Cancelled', variant: 'error' }),
              },
            ]}
          />
        </div>
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Remove item?"
        description="You can move it to your wishlist instead."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setModal(false)}>
              Remove
            </Button>
          </div>
        }
      >
        <p className="text-small text-text-secondary">
          Sample Wireless Earbuds will be removed from your cart.
        </p>
      </Modal>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        side={drawer ?? 'right'}
        title={drawer === 'left' ? 'Menu' : drawer === 'bottom' ? 'Filters' : 'Your cart'}
        footer={
          drawer === 'bottom' ? (
            <Button fullWidth onClick={() => setDrawer(null)}>
              Show results
            </Button>
          ) : undefined
        }
      >
        <p className="text-small text-text-secondary">
          Drawer content. Press Escape, the backdrop or the close button to dismiss — focus returns
          to the trigger.
        </p>
      </Drawer>
    </div>
  );
}

export function InteractiveDemos() {
  return (
    <ToastProvider>
      <Demos />
    </ToastProvider>
  );
}
