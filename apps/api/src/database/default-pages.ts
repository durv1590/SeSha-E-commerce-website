/**
 * Starting drafts for the pages every Indian online store needs. They are created
 * UNPUBLISHED: the business must review them (and have legal text checked) before
 * publishing from Admin → Pages. Existing pages are never overwritten.
 *
 * Content uses the storefront's restricted Markdown: ## headings, paragraphs,
 * - bullet lists, 1. numbered lists, **bold**, _italic_ and [links](/path).
 */
export const DEFAULT_PAGES: {
  slug: string;
  title: string;
  metaDescription: string;
  content: string;
}[] = [
  {
    slug: 'about-us',
    title: 'About us',
    metaDescription:
      'SeShaKart brings quality products to homes across India with fair prices and reliable delivery.',
    content: `SeShaKart is an online store run by **SeShaKart Pvt. Ltd.** Our aim is simple: smart shopping and better living, with fair prices, genuine products and delivery you can rely on.

## What we sell
Electronics, fashion, home and kitchen, beauty and more, from brands we check before listing.

## Why shop with us
- Secure payments by UPI, cards, net banking and wallets, or cash on delivery where available
- Easy returns within the return window shown on each product
- Order tracking from dispatch to delivery
- Friendly support by email and phone

[Contact us](/pages/contact-us) if you have any questions.`,
  },
  {
    slug: 'contact-us',
    title: 'Contact us',
    metaDescription: 'How to reach SeShaKart customer support.',
    content: `We're happy to help with orders, returns and anything else.

## Customer support
- Email: the support address shown at the bottom of every page
- Phone: the support number shown at the bottom of every page
- Hours: Monday to Saturday, 10 am to 6 pm (India time)

Please include your order number (it starts with **SK**) so we can help faster. You can also [track your order](/track-order) at any time.`,
  },
  {
    slug: 'shipping-policy',
    title: 'Shipping policy',
    metaDescription: 'Delivery times, charges and areas served by SeShaKart.',
    content: `## Where we deliver
We deliver to most PIN codes in India. Enter your PIN code on a product page to check delivery and cash on delivery for your area.

## Delivery times
Orders are usually delivered within the dates shown on the product page and at checkout, counted in business days (Monday to Saturday, excluding public holidays). Remote areas can take a little longer.

## Charges
Delivery charges, if any, are shown in your cart before you pay. Orders above the free-delivery amount shown in the cart ship free.

## Tracking
Once your order ships you'll receive the courier name and tracking number by email, and you can follow it from [your orders](/account/orders).`,
  },
  {
    slug: 'returns-and-refunds',
    title: 'Returns and refunds',
    metaDescription: 'How to return a product and how refunds work at SeShaKart.',
    content: `## Return window
Most products can be returned or replaced within the return window shown on the product page, counted from the day of delivery. Some products (for example personal care items) can't be returned for hygiene reasons; this is shown on the product page.

## How to return
1. Open the order in [your orders](/account/orders) and choose **Return or replace**.
2. Select the items and the reason.
3. We'll review the request and arrange a pickup.

Items should be unused, with tags and original packaging.

## Refunds
- Online payments are refunded to the original payment method, usually within 5–7 working days after we receive the item.
- Cash-on-delivery orders are refunded by bank transfer or UPI.

## Cancellations
You can cancel an order from your account until it is packed. Paid orders cancelled before dispatch are refunded in full.`,
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy policy',
    metaDescription: 'How SeShaKart collects, uses and protects your personal data.',
    content: `This policy explains what personal data SeShaKart Pvt. Ltd. collects and how we use it. **Have this reviewed for compliance with the Digital Personal Data Protection Act, 2023 before publishing.**

## What we collect
- Account details: name, email address, mobile number
- Delivery addresses
- Order and payment status (card and UPI details are handled by our payment partner, never stored by us)
- Technical data needed to keep your account secure, such as sign-in times

## How we use it
- To process and deliver your orders and handle returns
- To send order updates and, only if you agree, offers
- To prevent fraud and keep the service secure

## Cookies and analytics
Essential cookies keep you signed in, hold your cart and protect forms; the store can't work without them. Only if you agree (see "Cookie settings" at the bottom of every page) we also use:
- **Analytics** (Google Analytics): which pages and products are viewed, without your name, email or phone number
- **Marketing** (Meta Pixel): which of our Facebook and Instagram ads lead to purchases

You can change or withdraw your choice at any time. Remove any tool you don't use from this section before publishing.

## Sharing
We share only what is needed with couriers (delivery details) and our payment partner. We don't sell your data.

## Your choices
You can update your details and marketing preferences in [your account](/account). To delete your account, contact support.`,
  },
  {
    slug: 'terms-of-use',
    title: 'Terms of use',
    metaDescription: 'The terms that apply when you shop on SeShaKart.',
    content: `These terms apply to your use of the SeShaKart website and apps, operated by SeShaKart Pvt. Ltd. **Have these terms reviewed by a legal adviser before publishing.**

## Orders
An order is accepted when we confirm it. Prices include GST. If a price or product detail is wrong, we may cancel the order and refund any payment.

## Payments
Payments are processed securely by our payment partner. Cash on delivery is available for eligible orders and areas.

## Returns
Returns and refunds follow our [returns policy](/pages/returns-and-refunds).

## Your account
Keep your password private. We may suspend accounts used for fraud or abuse.

## Contact
Questions about these terms: see [contact us](/pages/contact-us).`,
  },
];
