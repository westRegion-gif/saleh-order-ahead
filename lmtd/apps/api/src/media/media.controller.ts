import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { Response } from 'express';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { MediaService } from './media.service';

class PresignDto {
  @IsString() @IsNotEmpty() filename!: string;
  @IsString() @IsIn(['image/jpeg','image/png','image/webp']) contentType!: string;
}

@Controller('media')
export class PublicMediaController {
  constructor(private readonly media: MediaService) {}

  @Get('object/:key')
  async read(@Param('key') encodedKey: string, @Res() res: Response) {
    const url = await this.media.signedReadUrl(decodeURIComponent(encodedKey));
    return res.redirect(302, url);
  }
}

@UseGuards(AdminAuthGuard)
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  @Post('presign')
  presign(@Body() body: PresignDto) {
    return this.media.presign(body.filename, body.contentType);
  }
}
