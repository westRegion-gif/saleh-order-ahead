import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { MediaService } from './media.service';

class PresignDto {
  @IsString() @IsNotEmpty() filename!: string;
  @IsString() @IsIn(['image/jpeg','image/png','image/webp']) contentType!: string;
}

@UseGuards(AdminAuthGuard)
@Controller('admin/media')
export class MediaController {
  constructor(private readonly media:MediaService){}
  @Post('presign') presign(@Body() body:PresignDto){ return this.media.presign(body.filename,body.contentType); }
}
