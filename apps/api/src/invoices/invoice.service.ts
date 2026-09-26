import { Injectable } from '@nestjs/common';
import type { Order, OrderItem, Prisma } from '@prisma/client';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { SettingsService } from '../settings/settings.service';
import { amountInWords, formatInvoiceNumber, isIntraState, splitTax } from './invoice-math';

/** Fonts (Inter with the ₹ glyph) and logo ship with the API (package.json "files"). */
const ASSETS = join(__dirname, '..', '..', 'assets');
const FONT = join(ASSETS, 'fonts', 'Inter-Regular.ttf');
const FONT_BOLD = join(ASSETS, 'fonts', 'Inter-Bold.ttf');
const LOGO = join(ASSETS, 'brand', 'logo.png');

const NAVY = '#0B1B33';
const MUTED = '#5B6474';
const BORDER = '#E3E7EE';
const PRIMARY = '#0B5FFF';

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

type Address = Record<string, string | null | undefined>;

/**
 * GST invoices. A number is issued once, when the goods are dispatched (time of
 * supply), from a database sequence, so numbers are unique and sequential.
 */
@Injectable()
export class InvoiceService {
  constructor(private readonly settings: SettingsService) {}

  /** Assigns the invoice number if the order doesn't have one yet (inside the caller's transaction). */
  async issue(tx: Prisma.TransactionClient, orderId: string, now = new Date()): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { invoiceNumber: true },
    });
    if (order.invoiceNumber) return;
    const [{ nextval }] = await tx.$queryRaw<
      { nextval: bigint }[]
    >`SELECT nextval('invoice_number_seq')`;
    await tx.order.update({
      where: { id: orderId },
      data: { invoiceNumber: formatInvoiceNumber(nextval, now), invoiceDate: now },
    });
  }

  async pdf(order: Order & { items: OrderItem[] }): Promise<Buffer> {
    if (!order.invoiceNumber || !order.invoiceDate) throw new Error('Invoice not issued');
    const store = await this.settings.get('store');
    const ship = order.shippingAddress as Address;
    const bill = order.billingAddress as Address;
    const intra = isIntraState(store.registeredState, ship.state ?? '');
    const lines = order.items.map((i) => ({ item: i, ...splitTax(i, intra) }));

    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Invoice ${order.invoiceNumber}`,
        Author: store.legalName,
        Subject: `Order ${order.orderNumber}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    doc.registerFont('Body', FONT);
    doc.registerFont('Bold', FONT_BOLD);
    const W = doc.page.width - 80;
    const L = 40;

    // ---- header
    if (existsSync(LOGO)) doc.image(LOGO, L, 36, { height: 30 });
    else doc.font('Bold').fontSize(18).fillColor(NAVY).text(store.name, L, 40);
    doc
      .font('Bold')
      .fontSize(16)
      .fillColor(NAVY)
      .text(store.gstin ? 'Tax Invoice' : 'Invoice', L, 40, { width: W, align: 'right' });
    doc
      .font('Body')
      .fontSize(8)
      .fillColor(MUTED)
      .text('Original for recipient', L, 60, { width: W, align: 'right' });

    // ---- seller & invoice facts
    let y = 90;
    doc
      .font('Bold')
      .fontSize(9)
      .fillColor(NAVY)
      .text(`Sold by: ${store.legalName}`, L, y, { width: W / 2 });
    doc.font('Body').fontSize(8).fillColor(MUTED);
    const sellerLines = [
      store.registeredAddress,
      store.registeredState,
      store.gstin ? `GSTIN: ${store.gstin}` : 'GSTIN: registration pending',
      `${store.supportEmail} · +91 ${store.supportPhone}`,
    ].filter(Boolean);
    doc.text(sellerLines.join('\n'), L, y + 13, { width: W / 2 - 10 });
    const facts: [string, string][] = [
      ['Invoice number', order.invoiceNumber],
      ['Invoice date', date(order.invoiceDate)],
      ['Order number', order.orderNumber],
      ['Order date', date(order.placedAt)],
      ['Payment', order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Prepaid (online)'],
      ['Place of supply', ship.state ?? ''],
    ];
    facts.forEach(([k, v], i) => {
      const fy = y + i * 12;
      doc
        .font('Body')
        .fontSize(8)
        .fillColor(MUTED)
        .text(k, L + W / 2, fy, { width: 90 });
      doc
        .font('Bold')
        .fontSize(8)
        .fillColor(NAVY)
        .text(v, L + W / 2 + 90, fy, { width: W / 2 - 90 });
    });

    // ---- addresses
    y = 175;
    const addr = (a: Address) =>
      [
        a.name,
        a.line1,
        a.line2,
        a.landmark,
        `${a.city ?? ''}, ${a.state ?? ''} ${a.pincode ?? ''}`,
        a.phone ? `Phone: ${a.phone}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    doc.font('Bold').fontSize(9).fillColor(NAVY).text('Bill to', L, y);
    doc
      .font('Body')
      .fontSize(8)
      .fillColor(NAVY)
      .text(addr(bill), L, y + 13, { width: W / 2 - 10 });
    doc
      .font('Bold')
      .fontSize(9)
      .fillColor(NAVY)
      .text('Ship to', L + W / 2, y);
    doc
      .font('Body')
      .fontSize(8)
      .fillColor(NAVY)
      .text(addr(ship), L + W / 2, y + 13, { width: W / 2 });

    // ---- line items
    y = 265;
    const cols = intra
      ? [
          { h: 'Item', w: 190, a: 'left' as const },
          { h: 'HSN', w: 40, a: 'left' as const },
          { h: 'Qty', w: 28, a: 'right' as const },
          { h: 'Taxable value', w: 70, a: 'right' as const },
          { h: 'CGST', w: 58, a: 'right' as const },
          { h: 'SGST', w: 58, a: 'right' as const },
          { h: 'Total', w: W - 444, a: 'right' as const },
        ]
      : [
          { h: 'Item', w: 210, a: 'left' as const },
          { h: 'HSN', w: 45, a: 'left' as const },
          { h: 'Qty', w: 30, a: 'right' as const },
          { h: 'Taxable value', w: 80, a: 'right' as const },
          { h: 'IGST', w: 80, a: 'right' as const },
          { h: 'Total', w: W - 445, a: 'right' as const },
        ];
    const row = (cells: string[], top: number, font: 'Body' | 'Bold', color = NAVY) => {
      let x = L;
      let h = 0;
      cells.forEach((c, i) => {
        const col = cols[i]!;
        doc.font(font).fontSize(8).fillColor(color);
        const opts = { width: col.w - 6, align: col.a };
        h = Math.max(h, doc.heightOfString(c, opts));
        doc.text(c, x + 3, top, opts);
        x += col.w;
      });
      return h;
    };
    doc.rect(L, y - 4, W, 18).fill('#F3F6FB');
    row(
      cols.map((c) => c.h),
      y,
      'Bold',
      MUTED,
    );
    y += 20;
    for (const l of lines) {
      const i = l.item;
      const name = `${i.productName}${i.variantName ? ` (${i.variantName})` : ''}\nSKU ${i.sku}${i.discountAmount ? ` · coupon −${rupees(i.discountAmount)}` : ''}`;
      const rate = `${i.taxRate}%`;
      const cells = intra
        ? [
            name,
            i.hsnCode ?? '–',
            String(i.quantity),
            rupees(l.taxable),
            `${rupees(l.cgst)}\n@${i.taxRate / 2}%`,
            `${rupees(l.sgst)}\n@${i.taxRate / 2}%`,
            rupees(l.gross),
          ]
        : [
            name,
            i.hsnCode ?? '–',
            String(i.quantity),
            rupees(l.taxable),
            `${rupees(l.igst)}\n@${rate}`,
            rupees(l.gross),
          ];
      if (y > doc.page.height - 200) {
        doc.addPage();
        y = 40;
      }
      const h = row(cells, y, 'Body');
      y += h + 8;
      doc
        .moveTo(L, y - 4)
        .lineTo(L + W, y - 4)
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .stroke();
    }

    // ---- totals
    const sum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst' | 'gross') =>
      lines.reduce((s, l) => s + l[k], 0);
    const totals: [string, string][] = [
      ['Taxable value', rupees(sum('taxable'))],
      ...(intra
        ? ([
            ['CGST', rupees(sum('cgst'))],
            ['SGST', rupees(sum('sgst'))],
          ] as [string, string][])
        : ([['IGST', rupees(sum('igst'))]] as [string, string][])),
      ['Items total', rupees(sum('gross'))],
      ...(order.shippingFee
        ? ([['Delivery charges', rupees(order.shippingFee)]] as [string, string][])
        : []),
      ...(order.codFee
        ? ([['Cash on delivery charges', rupees(order.codFee)]] as [string, string][])
        : []),
    ];
    y += 6;
    for (const [k, v] of totals) {
      doc
        .font('Body')
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(k, L + W - 250, y, { width: 150, align: 'right' });
      doc
        .font('Body')
        .fontSize(8.5)
        .fillColor(NAVY)
        .text(v, L + W - 100, y, { width: 100, align: 'right' });
      y += 14;
    }
    doc
      .moveTo(L + W - 250, y)
      .lineTo(L + W, y)
      .strokeColor(NAVY)
      .lineWidth(0.8)
      .stroke();
    y += 6;
    doc
      .font('Bold')
      .fontSize(11)
      .fillColor(NAVY)
      .text('Grand total', L + W - 250, y, { width: 150, align: 'right' });
    doc
      .font('Bold')
      .fontSize(11)
      .fillColor(PRIMARY)
      .text(rupees(order.grandTotal), L + W - 100, y, { width: 100, align: 'right' });
    y += 20;
    doc
      .font('Body')
      .fontSize(8)
      .fillColor(NAVY)
      .text(`Amount in words: ${amountInWords(order.grandTotal)}`, L, y, { width: W });
    y += 14;
    if (order.couponCode)
      doc
        .font('Body')
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Coupon ${order.couponCode} applied: −${rupees(order.couponDiscount)} (included above).`,
          L,
          y,
          { width: W },
        );

    // ---- footer
    doc
      .font('Body')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        `This is a computer-generated invoice and does not require a signature. Prices include GST. ` +
          `Whether tax is payable on reverse charge: No. For help, contact ${store.supportEmail} or +91 ${store.supportPhone}.`,
        L,
        doc.page.height - 70,
        { width: W, align: 'center' },
      );
    doc.end();
    return done;
  }
}
