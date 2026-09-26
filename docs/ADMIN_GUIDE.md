# Admin guide

How to run SeShaKart day to day from the admin at **www.seshakart.com/admin**. It is written for
store staff; developers will find the technical reference in [API.md](API.md).

## Signing in and access

- Staff sign in on the normal sign-in page and open **/admin** (or choose **Admin** after signing
  in). Customer accounts can't open the admin; they see "page not found".
- What you see depends on your **role**. Menu items and buttons you can't use are hidden, and the
  server refuses them anyway.

| Role              | Can do                                                                  |
| ----------------- | ----------------------------------------------------------------------- |
| Super admin       | Everything, including staff accounts                                    |
| Admin             | Everything except staff accounts                                        |
| Manager           | Catalogue, orders, customers (view), coupons, content, reviews, reports |
| Inventory manager | Products (view), stock, orders (view)                                   |
| Customer support  | Orders (including cancelling and returns), customers (view), reviews    |

Only admins and super admins can issue refunds, suspend customers, change settings or see the
audit log. Only admins can permanently delete products.

## The dashboard and the bell

- **Dashboard** shows sales, orders and average order value for today, the last 7 days or the
  last 30 days (compared with the period before), a 30-day chart (use **Show as table** for exact
  figures), work queues, recent orders and top products. Sales count confirmed orders, never
  cancelled ones.
- The **bell** in the top bar counts what needs attention: orders to ship, return requests,
  manual refunds to pay, reviews to moderate, and variants low on or out of stock. Each item
  opens the matching list. It refreshes every minute.

## Orders

**Sales → Orders** lists every order. The tabs are the daily work queues:

- **To ship**: confirmed orders waiting to be dispatched.
- **Awaiting payment**: online payments that haven't completed (stock is held for a short time,
  then the order is cancelled automatically if the customer doesn't pay).
- **Open returns** and **Manual refunds**.

Search by order number, customer name, email or phone, and filter by status, payment method or
dates. **Export CSV** downloads the orders in the current view.

On an order page, **Actions** shows only what makes sense for that order:

1. **Mark as processing / packed** (optional steps; the customer sees "Confirmed" until dispatch).
2. **Dispatch**: choose the courier and enter the tracking number (and the courier's tracking
   link if you have one). This issues the **GST invoice number**, emails the customer and moves
   the order to Shipped. The invoice can then be downloaded from the order page.
3. **Add tracking update**: in transit, out for delivery, **delivered**, failed attempt, or
   returned to us (undeliverable). Marking a cash-on-delivery order delivered records the cash as
   paid. An undeliverable parcel is restocked, and a prepaid order is refunded automatically.
4. **Cancel order**: possible until the order is dispatched. Stock goes back, and a prepaid order
   is refunded to the original payment method. The customer sees your reason.
5. **Refund**: full or partial. Online payments go back automatically (5–7 working days).
   **Cash-on-delivery refunds are paid by you** by bank transfer or UPI: after paying, press
   **Record payment** and enter the UTR/UPI reference.

The **History** card shows every change and who made it.

## Returns and replacements

Customers request returns from their order page within the product's return window.
**Sales → Returns** lists open requests, oldest first. On the order page:

1. **Approve** (arrange the pickup with your courier) or **Reject** (the customer sees your reason).
2. **Mark received** when the items arrive. Untick "Put the items back into stock" if they're
   damaged.
3. **Complete**. For a return, the refund for the returned items starts automatically: online
   payments go back to the original method, and a cash-on-delivery refund appears under **Manual
   refunds to pay** (pay it, then **Record payment**). Don't press **Refund** as well, unless you
   also want to refund something else, such as the delivery or COD fee. For a replacement,
   dispatch the new item.

## Products

**Catalogue → Products** lists every product with its price, available stock and sales. Filter
by status, category or stock level; **Export CSV** / **Import CSV** handle bulk changes.

To add a product, press **Add product**:

- **Details**: name, SKU (product code), optional URL, short and full description and key
  features (one per line).
- **Images**: upload JPEG, PNG, WebP, AVIF or GIF files up to 8 MB. Images are converted to WebP
  and their hidden location data is removed. The first image is the main one; use the arrows to
  reorder. Every image needs a short **description** for customers using screen readers (for
  example "Black earbuds in their charging case"). An image can be linked to one variant, such as
  a colour.
- **Variants, prices and stock**: every product has at least one variant with its own SKU, MRP
  and selling price (prices include GST) and opening stock. Options look like
  `Colour: Black | Size: M`. Choose the default variant shown first.
- **Specifications**, **Shipping, returns and warranty** (weight, dimensions, COD, return window),
  **Search engine listing** (a preview shows how it may look on Google), **Organisation**
  (category, brand, search tags, featured) and **Tax** (GST rate and HSN code for invoices).

New products are **drafts**. Press **Publish** when it's ready. Publishing needs at least one
active variant, one image and a visible category. **Unpublish** or **Archive** hides a product;
order history is always kept. A product that has been ordered can't be deleted, only archived.
If a variant that has been ordered is removed, it's kept as inactive instead.

If two people edit the same product, the second save is refused with a message to reload, so
nobody overwrites someone else's changes without noticing.

**Duplicate** copies a product as a new draft (new SKUs, no stock), handy for similar items.

### CSV import

1. Download the **template** or **Export current catalogue** as a starting point. One row per
   variant; rows with the same `product_sku` are one product. Prices are in rupees; lists use
   `|`.
2. **Check file**. Nothing is saved yet; every problem is listed with its line and column.
3. When there are no problems, press **Import**. The whole file is applied at once, or nothing is.

Only the columns in your file change. Nothing is ever deleted by an import. New products arrive as
drafts; add images in the editor, then publish. A `stock` value sets the stock count and is
recorded in the stock history.

## Categories and brands

- **Categories** go up to three levels (for example Electronics → Mobiles → Cases). Add a
  subcategory with the folder button on a row. Moving a category moves its subcategories too.
  Untick **Visible on the store** to hide a category (and everything under it) without deleting
  anything. Only empty categories can be deleted.
- **Brands** can be hidden the same way. Brands with products can't be deleted.

## Inventory

**Catalogue → Inventory** shows stock per variant. **Available** is what can be sold: stock minus
units **reserved** for orders that aren't paid or dispatched yet. The Low stock and Out of stock
tabs match the dashboard and cover live products only.

- **Adjust**: add stock (goods received), remove stock (damaged, lost) or set the count after a
  stock take. A reason is required. Stock can never go below what's reserved.
- **Low-stock alert at**: the level at which a variant counts as low.
- The **history** button shows every movement: sales, reservations, returns and adjustments, with
  who made them.

## Customers

**Sales → Customers** lists customer accounts with their orders and total spent. A customer's page
shows contact details, addresses and recent orders. **Suspend account** signs them out
everywhere and stops them signing in or ordering (existing orders are unaffected); a reason is
required and recorded. **Reactivate** reverses it.

## Coupons

**Sales → Coupons**: percentage (with an optional maximum) or fixed-amount discounts, a minimum
order value, start and end dates (India time), total and per-customer limits, specific
categories, and first-order-only. Coupons show as Live, Scheduled, Expired, Used up or Off.
A coupon that has been used can't be deleted or renamed; switch it off instead.

## Reviews

Only customers who **received** a product can review it, so every review is a verified purchase.
New and edited reviews wait in **Sales → Reviews**. **Approve** publishes them; **Reject** needs a
reason that the customer sees (they can edit and resubmit). Star ratings on the store count
approved reviews only.

## Content

- **Banners**: homepage hero slides (up to 5 show), offer cards (up to 4) and category-page
  banners. Set a heading, text, button and link (a page such as `/deals`, or an https link),
  images for desktop, tablet and mobile with a description, a schedule and a priority (higher
  shows first).
- **Homepage**: the product rails and their order (best sellers, new arrivals, featured, deals,
  or popular in a category). Rails fill themselves with live products and are hidden when empty.
- **Pages**: About us, Contact, Shipping, Returns, Privacy, Terms and any others. Write with the
  simple formatting shown beside the editor and check the **Preview**. Published pages appear in
  the footer under "Help & policies".

> The six starter pages are **drafts**. Read and adjust them for your business, and have the
> privacy policy and terms checked by a legal adviser, before publishing.

- **SEO**: override the title, description or sharing image of any store page (for example `/`
  or `/deals`), or hide a page from search engines (it also leaves the sitemap). Products,
  categories and brands have their own SEO fields in their editors. Live products, categories
  and brands with products, and published pages are added to the sitemap automatically.
  Analytics and cookie settings are set up by your developer: see
  [SEO_ANALYTICS.md](SEO_ANALYTICS.md).

Changes to products, banners, pages, SEO and settings show on the store straight away.

## Settings (admins)

- **Store**: name, tagline and support contacts; **legal name, GSTIN, registered state and
  address** for invoices. Set the GSTIN and registered state before launch: deliveries within
  your state are invoiced with CGST + SGST, others with IGST.
- **Checkout**: free-delivery amount, delivery fees, express on/off, cash on delivery (fee and
  maximum order), maximum quantity per item, how long stock is held during online payment, and
  how long abandoned carts are kept.
- **Delivery**: delivery days for standard and express, remote areas (PIN code prefixes that take
  longer), areas you don't deliver to, and areas without cash on delivery.
- **Search**: trending searches shown in the search box.

## Reports (managers and admins)

**Overview → Reports** shows sales by day or month for a preset (last 7 or 30 days, this or last
month, the current **financial year April–March**) or any dates. It includes orders, units, item
value, discounts, delivery and COD fees, GST included, refunds and net sales, broken down by
payment method and category. **Export CSV** for your accountant. Sales are counted on the day
the order was placed (India time); refunds on the day they were paid.

## Staff and the audit log (super admins / admins)

- **Store → Staff**: add a staff member by email and role. They receive an email asking them to
  **set their own password** with "Forgot password"; no password is ever sent. An existing
  customer email becomes a staff account. Change a role, suspend (signs them out at once) or
  remove staff access. You can't change your own access, and the store always keeps at least
  one super admin.
- **Store → Audit log**: a permanent record of every staff change (orders, refunds, products,
  stock, coupons, content, settings, staff) and account security events, with who, when and from
  which IP. Filter by area, record or date. Entries can't be edited or deleted.

## Good practice

- Give each person their own account with the lowest role that fits their work.
- Remove staff access on someone's last day (Staff → Change → No staff access).
- Record the UTR/UPI reference for every manual refund the same day you pay it.
- Keep the demo catalogue off production. See the README for `pnpm db:seed:demo --remove`.
