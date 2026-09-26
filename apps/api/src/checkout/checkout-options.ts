import type {
  CartTotalsDto,
  CheckoutTotalsDto,
  DeliveryOptionDto,
  PaymentOptionDto,
} from '@seshakart/types';
import type { CommerceSettings } from '@seshakart/validation';
import { formatRupees } from '../cart/pricing';

export type DeliveryChoice = 'STANDARD' | 'EXPRESS';
export type PaymentChoice = 'PREPAID' | 'COD';

/**
 * Pure checkout options: delivery methods, payment methods (with COD eligibility)
 * and the final totals for a choice. Shared by the quote and by order placement so
 * the shopper is charged exactly what they were shown.
 */
export function checkoutOptions(
  cart: CartTotalsDto,
  commerce: CommerceSettings,
  choice: { delivery: DeliveryChoice; payment: PaymentChoice },
  /** Every product in the cart allows cash on delivery. */
  allCodEligible: boolean,
): {
  deliveryOptions: DeliveryOptionDto[];
  paymentOptions: PaymentOptionDto[];
  totals: CheckoutTotalsDto;
  deliveryAvailable: boolean;
  paymentAvailable: boolean;
} {
  const deliveryOptions: DeliveryOptionDto[] = [
    {
      method: 'STANDARD',
      label: 'Standard delivery',
      estimate: '3–6 business days',
      fee: cart.shippingFee,
      available: true,
    },
    {
      method: 'EXPRESS',
      label: 'Express delivery',
      estimate: '1–3 business days',
      fee: commerce.expressShippingFee,
      available: commerce.expressEnabled,
    },
  ];
  const delivery = deliveryOptions.find((d) => d.method === choice.delivery)!;
  const shippingFee = cart.itemCount ? delivery.fee : 0;
  const beforeCod = cart.subtotal - cart.couponDiscount + shippingFee;

  let codReason: string | null = null;
  if (!commerce.codEnabled) codReason = 'Cash on delivery is currently unavailable.';
  else if (!allCodEligible) codReason = 'Some items in your cart can’t be paid for on delivery.';
  else if (beforeCod + commerce.codFee > commerce.codMaxOrderValue)
    codReason = `Cash on delivery is available on orders up to ${formatRupees(commerce.codMaxOrderValue)}.`;

  const paymentOptions: PaymentOptionDto[] = [
    {
      method: 'PREPAID',
      label: 'Pay online',
      description: 'UPI, cards, net banking and wallets',
      fee: 0,
      available: true,
      reason: null,
    },
    {
      method: 'COD',
      label: 'Cash on delivery',
      description: 'Pay in cash or by UPI when your order arrives',
      fee: commerce.codFee,
      available: codReason === null,
      reason: codReason,
    },
  ];
  const payment = paymentOptions.find((p) => p.method === choice.payment)!;
  const codFee = choice.payment === 'COD' && payment.available ? commerce.codFee : 0;

  return {
    deliveryOptions,
    paymentOptions,
    deliveryAvailable: delivery.available,
    paymentAvailable: payment.available,
    totals: {
      itemCount: cart.itemCount,
      mrpTotal: cart.mrpTotal,
      subtotal: cart.subtotal,
      productDiscount: cart.productDiscount,
      couponDiscount: cart.couponDiscount,
      shippingFee,
      codFee,
      taxIncluded: cart.taxIncluded,
      total: beforeCod + codFee,
    },
  };
}
