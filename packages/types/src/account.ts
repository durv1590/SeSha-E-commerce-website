import type { AddressLabel, Role } from './enums';
import type { Permission } from './permissions';

export interface UserDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  emailVerified: boolean;
  phoneVerified: boolean;
  hasPassword: boolean;
  marketingOptIn: boolean;
  createdAt: string;
}

/** Returned by /auth/me: the user plus what the UI may show (never a security boundary). */
export interface MeDto extends UserDto {
  permissions: Permission[];
}

/**
 * Login/register response. Web clients receive tokens as HttpOnly cookies only;
 * native apps (header `X-Client-Type: app`) receive them in the body instead.
 */
export interface AuthResultDto {
  user: MeDto;
  tokens?: { accessToken: string; refreshToken: string; accessTokenExpiresAt: string };
}

export interface SessionDto {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface AddressDto {
  id: string;
  label: AddressLabel;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Generic acknowledgement for flows that must not reveal whether an account exists. */
export interface AcceptedDto {
  message: string;
}
