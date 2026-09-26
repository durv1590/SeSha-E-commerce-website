import type { OtpPurpose } from '@prisma/client';
import { colors } from './brand-colors';

const PURPOSE_COPY: Record<OtpPurpose, { subject: string; action: string }> = {
  LOGIN: { subject: 'Your SeShaKart sign-in code', action: 'sign in to SeShaKart' },
  VERIFY_EMAIL: { subject: 'Verify your email for SeShaKart', action: 'verify your email address' },
  VERIFY_PHONE: {
    subject: 'Verify your mobile for SeShaKart',
    action: 'verify your mobile number',
  },
  RESET_PASSWORD: {
    subject: 'Reset your SeShaKart password',
    action: 'reset your SeShaKart password',
  },
};

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** Branded, inline-styled email layout (email clients ignore external CSS). */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><body style="margin:0;background:${colors.background};font-family:Arial,Helvetica,sans-serif;color:${colors.navy}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid ${colors.border};border-radius:14px">
<tr><td style="padding:20px 24px;border-bottom:1px solid ${colors.border};font-size:20px;font-weight:bold">
<span style="color:${colors.navy}">SeSha</span><span style="color:${colors.accentText}">Kart</span></td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${colors.border};font-size:12px;color:${colors.muted}">
SeShaKart Pvt. Ltd. · Smart Shopping, Better Living · www.seshakart.com</td></tr>
</table></td></tr></table></body></html>`;
}

export function otpEmail(purpose: OtpPurpose, code: string, minutes: number) {
  const copy = PURPOSE_COPY[purpose];
  const text = `Your code to ${copy.action} is ${code}. It expires in ${minutes} minutes. Never share this code with anyone — SeShaKart will never ask for it. If you didn't request it, you can ignore this email.`;
  const html = emailLayout(
    copy.subject,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">Use this code to ${copy.action}:</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:6px;color:${colors.primary}">${code}</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.5">It expires in ${minutes} minutes. <strong>Never share this code</strong> — SeShaKart will never ask for it.</p>
<p style="margin:0;font-size:13px;color:${colors.muted}">Didn’t request this? You can safely ignore this email.</p>`,
  );
  return { subject: copy.subject, text, html };
}

export function otpSms(purpose: OtpPurpose, code: string, minutes: number): string {
  return `${code} is your SeShaKart code to ${PURPOSE_COPY[purpose].action}. Valid ${minutes} min. Do not share it with anyone.`;
}

export function passwordChangedEmail(name: string) {
  const subject = 'Your SeShaKart password was changed';
  const text = `Hi ${name}, the password for your SeShaKart account was just changed and other devices were signed out. If this wasn't you, reset your password immediately and contact support.`;
  const html = emailLayout(
    subject,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(name)}, the password for your SeShaKart account was just changed and other devices were signed out.</p>
<p style="margin:0;font-size:14px;line-height:1.5">If this wasn’t you, reset your password immediately and contact support.</p>`,
  );
  return { subject, text, html };
}

export interface OrderEmailData {
  name: string;
  orderNumber: string;
  paymentMethod: 'PREPAID' | 'COD';
  total: number;
  items: { name: string; variantName: string; quantity: number; lineTotal: number }[];
  address: string;
  orderUrl: string;
}

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function orderConfirmedEmail(o: OrderEmailData) {
  const subject = `Order ${o.orderNumber} confirmed`;
  const pay =
    o.paymentMethod === 'COD'
      ? `Please keep ${rupees(o.total)} ready to pay on delivery (cash or UPI).`
      : `We’ve received your payment of ${rupees(o.total)}.`;
  const lines = o.items
    .map(
      (i) =>
        `${i.quantity} × ${i.name}${i.variantName ? ` (${i.variantName})` : ''} — ${rupees(i.lineTotal)}`,
    )
    .join('\n');
  const text = `Hi ${o.name}, thank you for shopping with SeShaKart! Your order ${o.orderNumber} is confirmed.\n\n${lines}\n\nTotal: ${rupees(o.total)}\n${pay}\n\nDelivering to: ${o.address}\n\nView your order: ${o.orderUrl}`;
  const rows = o.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;font-size:14px">${i.quantity} × ${escapeHtml(i.name)}${
          i.variantName
            ? ` <span style="color:${colors.muted}">(${escapeHtml(i.variantName)})</span>`
            : ''
        }</td><td align="right" style="padding:6px 0;font-size:14px">${rupees(i.lineTotal)}</td></tr>`,
    )
    .join('');
  const html = emailLayout(
    subject,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi ${escapeHtml(o.name)}, thank you for shopping with SeShaKart! Your order <strong>${escapeHtml(o.orderNumber)}</strong> is confirmed.</p>
<table role="presentation" width="100%" style="border-top:1px solid ${colors.border};border-bottom:1px solid ${colors.border};margin:0 0 12px">${rows}
<tr><td style="padding:8px 0;font-weight:bold">Total</td><td align="right" style="padding:8px 0;font-weight:bold">${rupees(o.total)}</td></tr></table>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5">${escapeHtml(pay)}</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5"><strong>Delivering to:</strong> ${escapeHtml(o.address)}</p>
<p style="margin:0"><a href="${escapeHtml(o.orderUrl)}" style="display:inline-block;background:${colors.primary};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">View your order</a></p>`,
  );
  return { subject, text, html };
}
