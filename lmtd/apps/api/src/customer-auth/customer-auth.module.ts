import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomerAuthService } from './customer-auth.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('CUSTOMER_JWT_SECRET');
        if (!secret) throw new Error('CUSTOMER_JWT_SECRET is required');
        return { secret };
      },
    }),
  ],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService, CustomerAuthGuard],
  exports: [CustomerAuthService, CustomerAuthGuard],
})
export class CustomerAuthModule {}
