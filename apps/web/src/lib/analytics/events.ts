/**
 * Store events and how each analytics tool names them. Money is in paise inside the
 * app and in rupees for the tools. No personal data is ever part of an event.
 */

export interface AnalyticsItem {
  /** Product slug: the one identifier every page, cart line and order line has. */
  id: string;
  name: string;
  variant?: string | null;
  brand?: string | null;
  category?: string | null;
  /** Unit price in paise. */
  price: number;
  quantity: number;
}

export type AnalyticsEvent =
  | { name: 'view_item'; item: AnalyticsItem }
  | { name: 'add_to_cart'; item: AnalyticsItem }
  | { name: 'begin_checkout'; items: AnalyticsItem[]; value: number; coupon?: string | null }
  | {
      name: 'purchase';
      orderNumber: string;
      items: AnalyticsItem[];
      value: number;
      shipping: number;
      tax: number;
      coupon?: string | null;
    }
  | { name: 'search'; query: string }
  | { name: 'sign_up' }
  | { name: 'login' };

const rupees = (paise: number) => Math.round(paise) / 100;

function gaItem(i: AnalyticsItem, index = 0) {
  return {
    item_id: i.id,
    item_name: i.name,
    ...(i.variant ? { item_variant: i.variant } : {}),
    ...(i.brand ? { item_brand: i.brand } : {}),
    ...(i.category ? { item_category: i.category } : {}),
    price: rupees(i.price),
    quantity: i.quantity,
    index,
  };
}

/** GA4 recommended e-commerce events. */
export function toGa4(e: AnalyticsEvent): [string, Record<string, unknown>] {
  switch (e.name) {
    case 'view_item':
    case 'add_to_cart':
      return [
        e.name,
        {
          currency: 'INR',
          value: rupees(e.item.price * e.item.quantity),
          items: [gaItem(e.item)],
        },
      ];
    case 'begin_checkout':
      return [
        e.name,
        {
          currency: 'INR',
          value: rupees(e.value),
          ...(e.coupon ? { coupon: e.coupon } : {}),
          items: e.items.map(gaItem),
        },
      ];
    case 'purchase':
      return [
        e.name,
        {
          transaction_id: e.orderNumber,
          currency: 'INR',
          value: rupees(e.value),
          shipping: rupees(e.shipping),
          tax: rupees(e.tax),
          ...(e.coupon ? { coupon: e.coupon } : {}),
          items: e.items.map(gaItem),
        },
      ];
    case 'search':
      return ['search', { search_term: e.query.slice(0, 100) }];
    case 'sign_up':
    case 'login':
      return [e.name, { method: 'email' }];
  }
}

/** Meta Pixel standard events; null when Meta has no equivalent worth sending. */
export function toMeta(
  e: AnalyticsEvent,
): [string, Record<string, unknown>, { eventID?: string }?] | null {
  const content = (items: AnalyticsItem[]) => ({
    content_ids: items.map((i) => i.id),
    contents: items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: rupees(i.price) })),
    content_type: 'product',
    currency: 'INR',
  });
  switch (e.name) {
    case 'view_item':
      return [
        'ViewContent',
        { ...content([e.item]), content_name: e.item.name, value: rupees(e.item.price) },
      ];
    case 'add_to_cart':
      return ['AddToCart', { ...content([e.item]), value: rupees(e.item.price * e.item.quantity) }];
    case 'begin_checkout':
      return [
        'InitiateCheckout',
        { ...content(e.items), value: rupees(e.value), num_items: e.items.length },
      ];
    case 'purchase':
      // eventID lets Meta de-duplicate against a future server-side Conversions API event.
      return [
        'Purchase',
        { ...content(e.items), value: rupees(e.value), num_items: e.items.length },
        { eventID: e.orderNumber },
      ];
    case 'search':
      return ['Search', { search_string: e.query.slice(0, 100) }];
    case 'sign_up':
      return ['CompleteRegistration', {}];
    case 'login':
      return null;
  }
}
