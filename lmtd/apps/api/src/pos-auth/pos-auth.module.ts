import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationsAuthGuard, PosAuthGuard } from './pos-auth.guard';
import { PosAuthController, PosMachineAdminController } from './pos-auth.controller';
import { PosAuthService } from './pos-auth.service';

@Module({
  imports: [PrismaModule, AdminAuthModule],
  controllers: [PosAuthController, PosMachineAdminController],
  providers: [PosAuthService, PosAuthGuard, OperationsAuthGuard],
  exports: [PosAuthService, PosAuthGuard, OperationsAuthGuard],
})
export class PosAuthModule {}
