import { z } from 'zod';
import { emailSchema, indianMobileSchema, passwordSchema } from './primitives';

/**
 * A login identifier: an email address or an Indian mobile number.
 * Output is normalised and tagged, e.g. { type: 'phone', value: '9876543210' }.
 */
export const identifierSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email or mobile number')
  .max(254)
  .transform((raw, ctx) => {
    if (raw.includes('@')) {
      const email = emailSchema.safeParse(raw);
      if (email.success) return { type: 'email' as const, value: email.data };
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid email address' });
      return z.NEVER;
    }
    const phone = indianMobileSchema.safeParse(raw);
    if (phone.success) return { type: 'phone' as const, value: phone.data };
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enter a valid email or 10-digit mobile number',
    });
    return z.NEVER;
  });
export type Identifier = z.output<typeof identifierSchema>;

/** A small deny-list of the most common passwords (checked case-insensitively). */
const COMMON_PASSWORDS = new Set([
  'password1',
  'password123',
  'passw0rd',
  'qwerty123',
  'qwerty1234',
  'abc12345',
  'abcd1234',
  '12345678a',
  'a1234567',
  'iloveyou1',
  'welcome1',
  'welcome123',
  'admin123',
  'admin1234',
  'letmein1',
  'india123',
  'india@123',
  'seshakart1',
  'seshakart123',
  'test1234',
  'pass1234',
  'changeme1',
  'monkey123',
  'dragon123',
  'sunshine1',
  'football1',
  'qwertyuiop1',
  '1q2w3e4r',
  'zaq12wsx',
  'asdf1234',
]);

/** Password policy for new passwords: base rules plus a common-password check. */
export const newPasswordSchema = passwordSchema.refine(
  (p) => !COMMON_PASSWORDS.has(p.toLowerCase()),
  {
    message: 'This password is too common. Choose something harder to guess.',
  },
);

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
    phone: indianMobileSchema.optional().or(z.literal('').transform(() => undefined)),
    password: newPasswordSchema,
    marketingOptIn: z.boolean().default(false),
  })
  .refine((v) => v.email || v.phone, {
    path: ['email'],
    message: 'Enter an email address or a mobile number',
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: identifierSchema,
  // Never apply the new-password policy at login (old passwords must still work).
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const otpRequestSchema = z.object({ identifier: identifierSchema });
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({ identifier: identifierSchema, code: otpCodeSchema });
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const forgotPasswordSchema = z.object({ identifier: identifierSchema });

export const resetPasswordSchema = z.object({
  identifier: identifierSchema,
  code: otpCodeSchema,
  password: newPasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Native apps send the refresh token in the body; browsers use the HttpOnly cookie. */
export const refreshSchema = z
  .object({ refreshToken: z.string().min(20).max(200).optional() })
  .default({});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const verifyContactRequestSchema = z.object({ channel: z.enum(['EMAIL', 'SMS']) });
export const verifyContactConfirmSchema = z.object({
  channel: z.enum(['EMAIL', 'SMS']),
  code: otpCodeSchema,
});
