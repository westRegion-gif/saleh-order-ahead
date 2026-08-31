import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { CustomerAuthModule } from '../customer-auth/customer-auth.module';
import { PosAuthModule } from '../pos-auth/pos-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerArrivalController, OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [PrismaModule, AdminAuthModule, PosAuthModule, CustomerAuthModule],
  controllers: [OperationsController, CustomerArrivalController],
  providers: [OperationsService],
})
export class OperationsModule {}
