import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { OtpChannel, OtpPurpose } from '@prisma/client';
import { AppException } from '../common/filters/all-exceptions.filter';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { MessagingService, SmsUnavailableError } from '../messaging/messaging.service';
import { otpEmail, otpSms } from '../messaging/templates';
import { hmac, randomOtp, safeEqual } from './crypto';

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap between two codes to the same target. */
export const OTP_RESEND_SECONDS = 60;
/** Maximum codes per target per hour (stops SMS-pumping / email-bombing). */
export const OTP_HOURLY_LIMIT = 5;

export interface OtpTarget {
  channel: OtpChannel;
  /** Normalised email or 10-digit mobile. */
  value: string;
}

/**
 * One-time codes for passwordless login, contact verification and password reset.
 * Codes are 6 random digits, stored only as an HMAC bound to target and purpose,
 * valid for 10 minutes, single-use, and locked after 5 wrong attempts.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private hash(target: OtpTarget, purpose: OtpPurpose, code: string): string {
    return hmac(
      this.env.SESSION_SECRET,
      `otp:${purpose}:${target.channel}:${target.value}:${code}`,
    );
  }

  /** Generates, stores and delivers a code. Enforces per-target rate limits. */
  async issue(target: OtpTarget, purpose: OtpPurpose): Promise<void> {
    if (target.channel === 'SMS' && !this.messaging.smsAvailable) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SMS_UNAVAILABLE',
        'Mobile codes are temporarily unavailable. Please use your email or password instead.',
      );
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.otpCode.findMany({
      where: { target: target.value, purpose, createdAt: { gte: hourAgo } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const last = recent[0];
    if (last && Date.now() - last.createdAt.getTime() < OTP_RESEND_SECONDS * 1000) {
      const wait = Math.ceil(
        (OTP_RESEND_SECONDS * 1000 - (Date.now() - last.createdAt.getTime())) / 1000,
      );
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_TOO_SOON',
        `Please wait ${wait} seconds before requesting a new code.`,
      );
    }
    if (recent.length >= OTP_HOURLY_LIMIT) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_LIMIT',
        'Too many codes requested. Please try again in an hour.',
      );
    }

    const code = randomOtp();
    await this.prisma.$transaction([
      // Only the newest code is ever valid.
      this.prisma.otpCode.updateMany({
        where: { target: target.value, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({
        data: {
          channel: target.channel,
          target: target.value,
          purpose,
          codeHash: this.hash(target, purpose, code),
          expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
        },
      }),
    ]);

    try {
      if (target.channel === 'EMAIL') {
        await this.messaging.sendEmail({
          to: target.value,
          ...otpEmail(purpose, code, OTP_TTL_MINUTES),
        });
      } else {
        await this.messaging.sendSms({
          to: target.value,
          text: otpSms(purpose, code, OTP_TTL_MINUTES),
        });
      }
    } catch (err) {
      if (err instanceof SmsUnavailableError) throw err;
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'DELIVERY_FAILED',
        'We couldn’t send the code right now. Please try again shortly.',
      );
    }
  }

  /** Consumes a valid code. Returns false for wrong/expired/used codes (never says which). */
  async verify(target: OtpTarget, purpose: OtpPurpose, code: string): Promise<boolean> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { target: target.value, purpose, channel: target.channel, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt <= new Date() || otp.attempts >= OTP_MAX_ATTEMPTS) return false;

    if (!safeEqual(otp.codeHash, this.hash(target, purpose, code))) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      return false;
    }
    // Conditional consume: a code can only be used once even under concurrent requests.
    const { count } = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return count === 1;
  }
}
