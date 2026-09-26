import type { User } from '@prisma/client';
import { ROLE_PERMISSIONS, type MeDto, type UserDto } from '@seshakart/types';

/** Public shape of a user. Never includes hashes, lockout counters or internal flags. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    phoneVerified: Boolean(user.phoneVerifiedAt),
    hasPassword: Boolean(user.passwordHash),
    marketingOptIn: user.marketingOptIn,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toMeDto(user: User): MeDto {
  return { ...toUserDto(user), permissions: [...ROLE_PERMISSIONS[user.role]] };
}
