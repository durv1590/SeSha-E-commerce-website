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
