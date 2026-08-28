import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BranchesModule } from './branches/branches.module';
import { CatalogModule } from './catalog/catalog.module';
import { AdminCatalogModule } from './admin-catalog/admin-catalog.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, BranchesModule, CatalogModule, AdminCatalogModule],
  controllers: [HealthController],
})
export class AppModule {}
