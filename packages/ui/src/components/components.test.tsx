import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { StockBadge } from './Badge';
import { Button, buttonVariants } from './Button';
import { DropdownMenu } from './Dropdown';
import { FormField, Input } from './Form';
import { Price } from './Price';
import { QuantityStepper } from './QuantityStepper';
import { Rating } from './Rating';

describe('Button', () => {
  it('defaults to type="button" so it never submits forms by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('is disabled and busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingText="Adding…" onClick={onClick}>
        Add to cart
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Adding…' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('accent variant uses navy text for AA contrast', () => {
    expect(buttonVariants({ variant: 'accent' })).toContain('text-navy');
  });
});

describe('FormField', () => {
  it('wires label, hint and error to the input', () => {
    const { rerender } = render(
      <FormField label="PIN code" hint="6 digits" required>
        <Input name="pincode" />
      </FormField>,
    );
    const input = screen.getByLabelText(/PIN code/);
    expect(input).toHaveAccessibleDescription('6 digits');
    expect(input).toBeRequired();
    expect(input).not.toHaveAttribute('aria-invalid');

    rerender(
      <FormField label="PIN code" hint="6 digits" error="Enter a valid 6-digit PIN code" required>
        <Input name="pincode" />
      </FormField>,
    );
    expect(screen.getByLabelText(/PIN code/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/PIN code/)).toHaveAccessibleDescription(
      'Enter a valid 6-digit PIN code',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid 6-digit PIN code');
  });
});

describe('Price', () => {
  it('shows price, MRP and discount with screen-reader context', () => {
    render(<Price price={99900} mrp={149900} showSavings />);
    expect(screen.getByText('₹999')).toBeInTheDocument();
    expect(screen.getByText('₹1,499')).toBeInTheDocument();
    expect(screen.getByText('33% off')).toBeInTheDocument();
    expect(screen.getByText('You save ₹500')).toBeInTheDocument();
    expect(screen.getByText('MRP', { exact: false })).toHaveClass('sr-only');
  });

  it('hides MRP and discount when there is no discount', () => {
    render(<Price price={99900} mrp={99900} />);
    expect(screen.queryByText(/off/)).not.toBeInTheDocument();
  });
});

describe('Rating', () => {
  it('announces a meaningful label', () => {
    render(<Rating value={4.26} count={1234} />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Rated 4.3 out of 5 from 1,234 reviews');
  });
});

describe('StockBadge', () => {
  it('describes low stock precisely', () => {
    render(<StockBadge state="low_stock" available={3} />);
    expect(screen.getByText('Only 3 left')).toBeInTheDocument();
  });
});

describe('QuantityStepper', () => {
  function Harness() {
    const [qty, setQty] = useState(1);
    return <QuantityStepper value={qty} onChange={setQty} max={3} itemLabel="Earbuds" />;
  }

  it('respects min and max bounds', async () => {
    render(<Harness />);
    const dec = screen.getByRole('button', { name: 'Decrease quantity of Earbuds' });
    const inc = screen.getByRole('button', { name: 'Increase quantity of Earbuds' });
    expect(dec).toBeDisabled();
    await userEvent.click(inc);
    await userEvent.click(inc);
    expect(screen.getByRole('status')).toHaveTextContent('3');
    expect(inc).toBeDisabled();
  });
});

describe('DropdownMenu', () => {
  it('supports keyboard navigation and returns focus on Escape', async () => {
    const onLogout = vi.fn();
    render(
      <DropdownMenu
        trigger="Account"
        items={[
          { label: 'Orders', onSelect: vi.fn() },
          { label: 'Profile' },
          { label: 'Log out', onSelect: onLogout },
        ]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Account' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await vi.waitFor(() => expect(screen.getByRole('menuitem', { name: 'Orders' })).toHaveFocus());

    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});

describe('Rating fill', () => {
  it('fills stars proportionally across the row, not per star', () => {
    const { container } = render(<Rating value={4.3} />);
    // 4 full stars (4 × 26 units) + 30% of the fifth (0.3 × 24).
    const rect = container.querySelector('clipPath rect')!;
    expect(Number(rect.getAttribute('width'))).toBeCloseTo(4 * 26 + 0.3 * 24, 5);
    // The clip must sit on an untransformed group: on a translated star it would be
    // measured per star and fill every star completely (a bug this test guards).
    const filled = container.querySelector('g[clip-path]')!;
    expect(filled.getAttribute('transform')).toBeNull();
    expect(filled.querySelectorAll('path')).toHaveLength(5);
    expect(container.querySelectorAll('g')).toHaveLength(2);
  });

  it('clips nothing for no rating and everything for five', () => {
    const w = (v: number) =>
      Number(
        render(<Rating value={v} />)
          .container.querySelector('clipPath rect')!
          .getAttribute('width'),
      );
    expect(w(0)).toBe(0);
    expect(w(5)).toBe(5 * 26);
  });
});

describe('Button sizes', () => {
  it('keeps semibold weight at every size', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      expect(buttonVariants({ size })).toContain('font-semibold');
    }
  });
});
