import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({ imports:[AdminAuthModule], controllers:[MediaController], providers:[MediaService] })
export class MediaModule {}
