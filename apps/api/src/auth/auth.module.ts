import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { CartModule } from '../cart/cart.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [JwtModule.register({}), CartModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    SessionService,
    TokenService,
    // Runs after the throttler guard (registered first in AppModule).
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, OtpService, SessionService, TokenService],
})
export class AuthModule {}
