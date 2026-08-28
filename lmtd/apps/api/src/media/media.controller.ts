import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { MediaService } from './media.service';

class PresignDto {
  @IsString() @IsNotEmpty() filename!: string;
  @IsString() @IsIn(['image/jpeg','image/png','image/webp']) contentType!: string;
}

@Controller('admin/media')
export class MediaController {
  constructor(private readonly media:MediaService){}
  @Post('presign') presign(@Body() body:PresignDto){ return this.media.presign(body.filename,body.contentType); }
}
