import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { MediaUploadDto } from '@seshakart/types';
import { memoryStorage } from 'multer';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RequireAnyPermission } from '../auth/decorators';
import { MAX_UPLOAD_BYTES, MediaService } from './media.service';

@Controller('admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** multipart/form-data with one `file` field. */
  @Post()
  @RequireAnyPermission('products:write', 'content:write', 'categories:write', 'brands:write')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuth() auth: AuthContext,
  ): Promise<MediaUploadDto> {
    return this.media.upload(file, auth.userId);
  }
}
