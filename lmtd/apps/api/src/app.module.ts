import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BranchesModule } from './branches/branches.module';
import { CatalogModule } from './catalog/catalog.module';
import { AdminCatalogModule } from './admin-catalog/admin-catalog.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { CustomerAuthModule } from './customer-auth/customer-auth.module';
import { MediaModule } from './media/media.module';
import { OperationsModule } from './operations/operations.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, RealtimeModule, AdminAuthModule, CustomerAuthModule, BranchesModule, CatalogModule, AdminCatalogModule, MediaModule, OrdersModule, PaymentsModule, OperationsModule],
  controllers: [HealthController],
})
export class AppModule {}
