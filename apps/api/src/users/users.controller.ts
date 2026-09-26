import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AcceptedDto, AddressDto, SessionDto, UserDto } from '@seshakart/types';
import {
  addressSchema,
  addressUpdateSchema,
  changePasswordSchema,
  paginationSchema,
  updateProfileSchema,
  verifyContactConfirmSchema,
  verifyContactRequestSchema,
  type AddressInput,
  type ChangePasswordInput,
  type PaginationInput,
  type UpdateProfileInput,
} from '@seshakart/validation';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { Authenticated, CurrentAuth } from '../auth/decorators';
import { ZodBody, ZodParam, ZodQuery } from '../common/validation/zod.pipe';
import { toUserDto } from './user.mapper';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from './users.service';

const idParam = z.string().min(1).max(40);

@Controller('users/me')
@Authenticated()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async profile(@CurrentAuth() auth: AuthContext): Promise<UserDto> {
    return toUserDto(await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } }));
  }

  @Patch()
  updateProfile(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(updateProfileSchema) body: UpdateProfileInput,
  ): Promise<UserDto> {
    return this.users.updateProfile(auth.userId, body);
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(changePasswordSchema) body: ChangePasswordInput,
    @Req() req: Request,
  ): Promise<AcceptedDto> {
    await this.users.changePassword(auth, body, {
      ip: req.ip,
      userAgent: req.header('user-agent'),
    });
    return { message: 'Password updated. Other devices have been signed out.' };
  }

  @Post('verify/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  async requestVerification(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(verifyContactRequestSchema) body: z.infer<typeof verifyContactRequestSchema>,
  ): Promise<AcceptedDto> {
    await this.users.requestContactVerification(auth.userId, body.channel);
    return { message: 'We’ve sent a 6-digit code. It expires in 10 minutes.' };
  }

  @Post('verify/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  confirmVerification(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(verifyContactConfirmSchema) body: z.infer<typeof verifyContactConfirmSchema>,
  ): Promise<UserDto> {
    return this.users.confirmContactVerification(auth.userId, body.channel, body.code);
  }

  @Get('sessions')
  sessions(@CurrentAuth() auth: AuthContext): Promise<SessionDto[]> {
    return this.users.listSessions(auth);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentAuth() auth: AuthContext,
    @ZodParam('id', idParam) id: string,
  ): Promise<void> {
    await this.users.revokeSession(auth, id);
  }

  @Get('addresses')
  addresses(@CurrentAuth() auth: AuthContext): Promise<AddressDto[]> {
    return this.users.listAddresses(auth.userId);
  }

  @Post('addresses')
  createAddress(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(addressSchema) body: AddressInput,
  ): Promise<AddressDto> {
    return this.users.createAddress(auth.userId, body);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentAuth() auth: AuthContext,
    @ZodParam('id', idParam) id: string,
    @ZodBody(addressUpdateSchema) body: Partial<AddressInput>,
  ): Promise<AddressDto> {
    return this.users.updateAddress(auth.userId, id, body);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAddress(
    @CurrentAuth() auth: AuthContext,
    @ZodParam('id', idParam) id: string,
  ): Promise<void> {
    await this.users.deleteAddress(auth.userId, id);
  }

  @Get('notifications')
  async notifications(
    @CurrentAuth() auth: AuthContext,
    @ZodQuery(paginationSchema) q: PaginationInput,
  ) {
    const { envelope, unread } = await this.users.listNotifications(
      auth.userId,
      q.page,
      Math.min(q.pageSize, 50),
    );
    return Object.assign(envelope, { unread });
  }

  @Post('notifications/read')
  @HttpCode(HttpStatus.OK)
  async readAll(@CurrentAuth() auth: AuthContext): Promise<{ updated: number }> {
    return { updated: await this.users.markNotificationsRead(auth.userId) };
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  async readOne(
    @CurrentAuth() auth: AuthContext,
    @ZodParam('id', idParam) id: string,
  ): Promise<{ updated: number }> {
    return { updated: await this.users.markNotificationsRead(auth.userId, id) };
  }
}
