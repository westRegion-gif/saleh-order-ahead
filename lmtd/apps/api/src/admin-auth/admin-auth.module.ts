import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from './admin-auth.guard';

@Module({
  imports:[ConfigModule,JwtModule.registerAsync({inject:[ConfigService],useFactory:(config:ConfigService)=>({secret:config.get<string>('ADMIN_JWT_SECRET')||config.get<string>('JWT_ACCESS_SECRET')||'dev-only-change-me',signOptions:{expiresIn:'2h'}})})],
  controllers:[AdminAuthController],
  providers:[AdminAuthService,AdminAuthGuard],
  exports:[AdminAuthGuard,JwtModule],
})
export class AdminAuthModule {}
