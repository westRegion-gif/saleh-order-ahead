import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BranchesModule } from './branches/branches.module';
import { CatalogModule } from './catalog/catalog.module';
import { AdminCatalogModule } from './admin-catalog/admin-catalog.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { MediaModule } from './media/media.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AdminAuthModule, BranchesModule, CatalogModule, AdminCatalogModule, MediaModule],
  controllers: [HealthController],
})
export class AppModule {}
