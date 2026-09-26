import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import type { EmailMessage, SentMessage, SmsMessage } from './messaging.types';

export class SmsUnavailableError extends Error {
  constructor() {
    super('SMS delivery is not configured');
  }
}

/**
 * Outbound email and SMS.
 *
 * - Email: SMTP (any provider: SES, SendGrid, Zoho, Gmail Workspace…) when SMTP_HOST
 *   is set; otherwise messages are logged (development) — production refuses to boot
 *   without SMTP (see env validation).
 * - SMS: provider adapter. "console" logs messages (development); "none" disables
 *   mobile OTP. A DLT-registered Indian SMS gateway (MSG91, Twilio, Gupshup…) plugs
 *   in here as a new provider.
 * - In tests every message is also captured in `outbox` so flows can read OTPs.
 */
@Injectable()
export class MessagingService implements OnModuleDestroy {
  private readonly logger = new Logger('Messaging');
  private readonly transporter: Transporter | null;
  /** Test-only capture of sent messages. */
  readonly outbox: SentMessage[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transporter = env.SMTP_HOST
      ? createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
        })
      : null;
  }

  get smsAvailable(): boolean {
    return this.env.SMS_PROVIDER !== 'none';
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    if (this.env.NODE_ENV === 'test') this.outbox.push({ kind: 'email', ...message });
    if (!this.transporter) {
      if (this.env.NODE_ENV === 'development') {
        this.logger.log(`[email → ${message.to}] ${message.subject}\n${message.text}`);
      }
      return;
    }
    await this.transporter.sendMail({ from: this.env.MAIL_FROM, ...message });
  }

  async sendSms(message: SmsMessage): Promise<void> {
    if (!this.smsAvailable) throw new SmsUnavailableError();
    if (this.env.NODE_ENV === 'test') this.outbox.push({ kind: 'sms', ...message });
    if (this.env.SMS_PROVIDER === 'console' && this.env.NODE_ENV === 'development') {
      this.logger.log(`[sms → ${message.to}] ${message.text}`);
    }
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }
}
