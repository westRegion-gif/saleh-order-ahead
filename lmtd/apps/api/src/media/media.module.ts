import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminMediaController, PublicMediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [PublicMediaController, AdminMediaController],
  providers: [MediaService],
})
export class MediaModule {}
